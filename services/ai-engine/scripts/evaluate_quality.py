"""
US-05 – Transcription quality report CLI.

Provides reference-based WER/CER evaluation and a rich quality report for
individual audio files.  Fully backward-compatible with the existing
manifest-based evaluate_wer.py workflow.

Usage (from services/ai-engine or the project root)
----------------------------------------------------
# 1. Evaluate a single file with an inline reference:
python scripts/evaluate_quality.py \\
    --audio tests/transcription/fixtures/Test01.wav \\
    --reference "To operational sense hamaara ek aisa project hai ..." \\
    --profile hinglish --quality fast

# 2. Evaluate using a plain-text reference file:
python scripts/evaluate_quality.py \\
    --audio tests/transcription/fixtures/Test01.wav \\
    --ref-file tests/transcription/fixtures/Test01_ref.txt \\
    --profile hinglish --quality fast

# 3. Evaluate without a reference (diagnostics only, no WER/CER):
python scripts/evaluate_quality.py \\
    --audio tests/transcription/fixtures/Test01.wav \\
    --profile hinglish --quality fast

# 4. Compare fast vs accurate on the same clip:
python scripts/evaluate_quality.py \\
    --audio tests/transcription/fixtures/Test01.wav \\
    --ref-file tests/transcription/fixtures/Test01_ref.txt \\
    --profile hinglish --compare

# 5. Manifest-based batch evaluation (backward-compatible with evaluate_wer.py):
python scripts/evaluate_quality.py \\
    scripts/manifest_hinglish.csv \\
    --profile hinglish --quality fast
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# _common path fixup is inherited: when run from services/ai-engine the
# _common module in scripts/ adds services/ai-engine to sys.path.
# ---------------------------------------------------------------------------
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from _common import add_config_args, build_config  # noqa: E402


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def _fmt_pct(value: float | None, decimals: int = 1) -> str:
    return "N/A" if value is None else f"{value * 100:.{decimals}f}%"


def _fmt_float(value: float | None, decimals: int = 4) -> str:
    return "N/A" if value is None else f"{value:.{decimals}f}"


def _fmt_seconds(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.2f} s"


def _divider(char: str = "─", width: int = 68) -> str:
    return char * width


# ---------------------------------------------------------------------------
# Single-file quality report printer
# ---------------------------------------------------------------------------


def _print_quality_report(
    report,       # QualityReport
    audio_path: str,
    *,
    out=None,
) -> None:
    """Print the full quality report for one audio file to *out* (default stdout)."""
    if out is None:
        out = sys.stdout

    p = lambda *a, **kw: print(*a, **kw, file=out)  # noqa: E731

    p("")
    p(_divider("═"))
    p("  US-05 TRANSCRIPTION QUALITY REPORT")
    p(_divider("═"))
    p(f"  Audio   : {Path(audio_path).name}")
    p(f"  Model   : {report.model_name}")
    p(f"  Profile : {report.profile}")
    p(f"  Quality : {report.quality or 'N/A'}")
    p(f"  Status  : {report.status}")
    p(_divider())

    # --- Transcript ---
    p("")
    p("GENERATED TRANSCRIPT:")
    if report.transcript:
        p(f"  {report.transcript}")
    else:
        p("  (no transcript – status is not COMPLETED)")

    # --- Reference-based evaluation ---
    p("")
    p(_divider())
    if report.reference is None:
        p("REFERENCE-BASED EVALUATION: (no reference provided)")
        p("  WER and CER cannot be computed without a ground-truth transcript.")
        p("  Supply one with --reference or --ref-file.")
    else:
        p("REFERENCE-BASED EVALUATION:")
        p(f"  Reference : {report.reference}")
        p("")
        p(f"  WER  (Word Error Rate)        : {_fmt_pct(report.wer)}")
        p(f"  CER  (Char Error Rate)        : {_fmt_pct(report.cer)}")
        wap = report.word_accuracy_proxy
        p(f"  Word Accuracy Proxy (1-WER)   : {_fmt_pct(wap / 100.0 if wap is not None else None)}")
        p("    ↑ WER-derived proxy; not an independently measured accuracy probability.")
        p("")

        if report.alignment is not None:
            al = report.alignment
            p("  Word Statistics:")
            p(f"    Reference words  : {al.n_ref_words}")
            p(f"    Hypothesis words : {al.n_hyp_words}")
            p(f"    Correct matches  : {al.n_correct}")
            p(f"    Substitutions    : {al.n_substitutions}")
            p(f"    Deletions        : {al.n_deletions}")
            p(f"    Insertions       : {al.n_insertions}")
            p(f"    Total errors     : {al.n_errors}")

    # --- Diagnostics ---
    p("")
    p(_divider())
    p("TRANSCRIPTION DIAGNOSTICS:")
    alp = report.avg_logprob
    nsp = report.no_speech_prob
    p(f"  Avg log-probability (mean over segments) : {_fmt_float(alp, 4)}")
    if alp is not None:
        if alp > -0.3:
            confidence_hint = "high model confidence in token sequence"
        elif alp > -0.6:
            confidence_hint = "moderate model confidence"
        else:
            confidence_hint = "lower model confidence – treat output with care"
        p(f"    ↑ {confidence_hint} (range roughly 0 to −2; not a WER predictor)")
    else:
        p("    ↑ Not available from this model/version")
    p(f"  No-speech probability (mean)             : {_fmt_float(nsp, 6)}")
    if nsp is not None:
        p("    ↑ Near 0 = likely real speech; near 1 = likely silence/noise")
    p(f"  Processing time                          : {_fmt_seconds(report.processing_seconds)}")
    p(f"  Segments                                 : {len(report.segments)}")
    if report.error_code:
        p(f"  Error code    : {report.error_code}")
        p(f"  Error message : {report.error_message}")

    # --- Segment breakdown ---
    if len(report.segments) > 1:
        p("")
        p(_divider())
        p("SEGMENT BREAKDOWN:")
        for i, seg in enumerate(report.segments, 1):
            p(f"  [{i}] {seg.start:.2f}s – {seg.end:.2f}s")
            p(f"       Text         : {seg.text.strip()}")
            p(f"       avg_logprob  : {_fmt_float(seg.avg_logprob, 4)}")
            p(f"       no_speech_p  : {_fmt_float(seg.no_speech_prob, 6)}")

    # --- Word-level alignment ---
    if report.alignment is not None and report.alignment.ops:
        p("")
        p(_divider())
        p("WORD-LEVEL COMPARISON (normalized):")
        p("  Legend: [OK:word] [SUB:ref→hyp] [DEL:ref] [INS:hyp]")
        p("")
        for line in report.alignment.render(width=66).splitlines():
            p(f"  {line}")

    # --- Final assessment ---
    p("")
    p(_divider())
    p("FINAL ASSESSMENT:")
    if report.status != "COMPLETED":
        p(f"  Transcription did not complete (status={report.status}).")
        if report.error_message:
            p(f"  Reason: {report.error_message}")
    elif report.wer is None:
        p("  Transcription completed. No reference provided – accuracy unknown.")
        p("  To measure WER/CER, supply a human reference with --ref-file or --reference.")
    else:
        wer_pct = report.wer * 100
        if wer_pct <= 10:
            verdict = "Excellent"
        elif wer_pct <= 25:
            verdict = "Good"
        elif wer_pct <= 40:
            verdict = "Fair"
        elif wer_pct <= 60:
            verdict = "Poor"
        else:
            verdict = "Very poor"
        p(f"  Verdict          : {verdict} (WER {wer_pct:.1f}%)")
        if report.alignment:
            al = report.alignment
            p(f"  Correct words    : {al.n_correct} / {al.n_ref_words}")
            if al.n_substitutions:
                p(f"  Substitutions    : {al.n_substitutions}  "
                  "(word recognized but spelled/pronounced differently)")
            if al.n_deletions:
                p(f"  Deletions        : {al.n_deletions}  (words missed by the model)")
            if al.n_insertions:
                p(f"  Insertions       : {al.n_insertions}  (extra words hallucinated by the model)")
        p("")
        p("  Note: Hinglish WER over-counts harmless spelling variants")
        p("  (e.g. 'kya' vs 'kia', 'nahin' vs 'nahi').  Compare models")
        p("  relative to each other on the same reference set.")

    p(_divider("═"))
    p("")


# ---------------------------------------------------------------------------
# Comparison (fast vs accurate)
# ---------------------------------------------------------------------------


def _run_comparison(
    audio_path: str,
    reference: str | None,
    base_args,
) -> None:
    """Transcribe with both quality modes and print a side-by-side summary."""
    from app.transcription.config import TranscriptionConfig, HINGLISH_MODELS
    from app.transcription.models import TranscriptionRequest
    from app.transcription.transcription_service import TranscriptionService
    from app.transcription.quality_report import QualityReport

    results = {}
    for quality in ("fast", "accurate"):
        config = TranscriptionConfig.hinglish(quality)
        service = TranscriptionService(config=config)
        result = service.transcribe(TranscriptionRequest(audio_path=audio_path))
        rpt = QualityReport.build(result, config, reference=reference)
        results[quality] = rpt

    fast = results["fast"]
    acc = results["accurate"]

    print("\n" + "═" * 68)
    print("  US-05 FAST vs ACCURATE COMPARISON")
    print("═" * 68)
    print(f"  Audio : {Path(audio_path).name}")
    print("")
    hdr = f"  {'Metric':<30} {'Fast':>14} {'Accurate':>14}"
    print(hdr)
    print("  " + "─" * 60)

    def row(label, fast_val, acc_val):
        print(f"  {label:<30} {fast_val:>14} {acc_val:>14}")

    row("Status", fast.status, acc.status)
    row("Model", fast.model_name.split("/")[-1], acc.model_name.split("/")[-1])
    row("Processing time", _fmt_seconds(fast.processing_seconds), _fmt_seconds(acc.processing_seconds))
    row("WER", _fmt_pct(fast.wer), _fmt_pct(acc.wer))
    row("CER", _fmt_pct(fast.cer), _fmt_pct(acc.cer))
    row("Word Accuracy Proxy",
        _fmt_pct(fast.word_accuracy_proxy / 100 if fast.word_accuracy_proxy is not None else None),
        _fmt_pct(acc.word_accuracy_proxy / 100 if acc.word_accuracy_proxy is not None else None))
    row("Avg log-prob", _fmt_float(fast.avg_logprob, 3), _fmt_float(acc.avg_logprob, 3))

    if fast.alignment and acc.alignment:
        fa, aa = fast.alignment, acc.alignment
        row("Correct words", f"{fa.n_correct}/{fa.n_ref_words}", f"{aa.n_correct}/{aa.n_ref_words}")
        row("Substitutions", str(fa.n_substitutions), str(aa.n_substitutions))
        row("Deletions", str(fa.n_deletions), str(aa.n_deletions))
        row("Insertions", str(fa.n_insertions), str(aa.n_insertions))

    print("")
    print("  FAST transcript:")
    print(f"    {fast.transcript or '(none)'}")
    print("  ACCURATE transcript:")
    print(f"    {acc.transcript or '(none)'}")
    if reference:
        print("  REFERENCE:")
        print(f"    {reference}")
    print("═" * 68)
    print("")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _load_reference(args) -> str | None:
    """Resolve reference text from --reference or --ref-file."""
    if getattr(args, "reference", None):
        return args.reference.strip()
    ref_file = getattr(args, "ref_file", None)
    if ref_file:
        p = Path(ref_file)
        if not p.exists():
            print(f"ERROR: --ref-file not found: {ref_file}", file=sys.stderr)
            sys.exit(2)
        return p.read_text(encoding="utf-8").strip()
    return None


def main(argv: list[str] | None = None) -> int:  # noqa: C901
    parser = argparse.ArgumentParser(
        description="US-05 transcription quality report and WER evaluation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Positional: optional manifest (preserves evaluate_wer.py backward compat).
    parser.add_argument(
        "manifest",
        nargs="?",
        help="CSV manifest with 'audio' and 'reference' columns (batch mode).",
    )

    # Single-file mode.
    parser.add_argument(
        "--audio", "-a",
        metavar="FILE",
        help="Single audio file to evaluate.",
    )
    parser.add_argument(
        "--reference", "-r",
        metavar="TEXT",
        help="Ground-truth reference transcript (inline text).",
    )
    parser.add_argument(
        "--ref-file",
        metavar="FILE",
        help="Path to a plain-text file containing the reference transcript.",
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="Compare fast vs accurate quality modes for the same audio file.",
    )
    parser.add_argument(
        "--json",
        metavar="FILE",
        nargs="?",
        const="-",
        help="Write JSON output.  Use '-' for stdout or supply a filename.",
    )
    parser.add_argument(
        "--no-align",
        action="store_true",
        help="Skip word-level alignment output (faster for large manifests).",
    )

    add_config_args(parser)
    args = parser.parse_args(argv)

    # ------------------------------------------------------------------ #
    # Decide mode: single-file vs manifest-batch                          #
    # ------------------------------------------------------------------ #
    if args.audio and args.manifest:
        print("ERROR: Specify --audio OR a manifest, not both.", file=sys.stderr)
        return 2

    try:
        config = build_config(args)
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    from app.transcription.models import TranscriptionRequest
    from app.transcription.transcription_service import TranscriptionService
    from app.transcription.quality_report import QualityReport

    # ================================================================== #
    # COMPARE MODE                                                        #
    # ================================================================== #
    if args.compare:
        if not args.audio:
            print("ERROR: --compare requires --audio.", file=sys.stderr)
            return 2
        if config.profile != "hinglish":
            print("ERROR: --compare is only meaningful with --profile hinglish.", file=sys.stderr)
            return 2
        ref = _load_reference(args)
        _run_comparison(args.audio, ref, args)
        return 0

    # ================================================================== #
    # SINGLE-FILE MODE                                                    #
    # ================================================================== #
    if args.audio:
        audio_path = args.audio
        ref = _load_reference(args)

        if ref is None:
            print(
                "Warning: No reference provided. WER/CER will not be computed.\n"
                "  Use --reference TEXT or --ref-file FILE to supply one.",
                file=sys.stderr,
            )

        service = TranscriptionService(config=config)
        result = service.transcribe(TranscriptionRequest(audio_path=audio_path))
        report = QualityReport.build(result, config, reference=ref)
        # Patch the audio_path so the report header shows the right file.
        report.audio_path = audio_path

        # JSON output.
        if args.json is not None:
            data = {
                "audio": audio_path,
                "model": report.model_name,
                "profile": report.profile,
                "quality": report.quality,
                "status": report.status,
                "transcript": report.transcript,
                "reference": report.reference,
                "wer": report.wer,
                "cer": report.cer,
                "word_accuracy_proxy": report.word_accuracy_proxy,
                "processing_seconds": report.processing_seconds,
                "avg_logprob": report.avg_logprob,
                "no_speech_prob": report.no_speech_prob,
                "alignment": [
                    {"op": op, "ref": r, "hyp": h}
                    for op, r, h in (report.alignment.ops if report.alignment else [])
                ],
            }
            if args.json == "-":
                print(json.dumps(data, ensure_ascii=False, indent=2))
            else:
                Path(args.json).write_text(
                    json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(f"JSON report written to: {args.json}")
        else:
            _print_quality_report(report, audio_path)

        return 0 if report.status in ("COMPLETED", "EMPTY") else 1

    # ================================================================== #
    # MANIFEST / BATCH MODE (backward-compatible with evaluate_wer.py)   #
    # ================================================================== #
    if args.manifest:
        from app.transcription.evaluation import evaluate_rows, load_manifest

        rows = load_manifest(args.manifest)
        if not rows:
            print("Manifest has no rows.", file=sys.stderr)
            return 2

        service = TranscriptionService(config=config)

        def run(path: str):
            return service.transcribe(TranscriptionRequest(audio_path=path))

        report_obj = evaluate_rows(rows, run)

        print(f"model={config.model_name} profile={config.profile} language={config.language}")
        for item in report_obj.items:
            wer_pct = f"{item.wer * 100:.1f}%"
            print(f"  WER {wer_pct:>6}  [{item.status}]  {Path(item.audio_path).name}")
            print(f"    ref : {item.reference}")
            print(f"    hyp : {item.hypothesis}")
        wer = report_obj.corpus_wer
        print(
            f"\nSamples: {len(report_obj.items)}  "
            f"Corpus WER: {'N/A' if wer is None else f'{wer:.3f} ({wer * 100:.1f}%)'}"
        )

        if args.json and args.json != "-":
            Path(args.json).write_text(
                json.dumps(report_obj.to_dict(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"JSON written to: {args.json}")
        elif args.json == "-":
            print(json.dumps(report_obj.to_dict(), ensure_ascii=False, indent=2))

        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

