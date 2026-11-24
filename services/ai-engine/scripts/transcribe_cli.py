"""Transcribe one audio file from the command line (demo for reviewers).

Run from ``services/ai-engine``::

    python scripts/transcribe_cli.py recording.wav --profile hinglish
    python scripts/transcribe_cli.py recording.wav --json
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

from _common import add_config_args, build_config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="US-05 transcription demo")
    parser.add_argument("audio", help="Path to a WAV/MP3/FLAC/OGG file (max 30 s).")
    parser.add_argument("--reference", "--ref", default=None, help="Reference transcript or path to .txt file for accuracy evaluation.")
    parser.add_argument("--json", action="store_true", help="Print the full result as JSON.")
    add_config_args(parser)
    args = parser.parse_args(argv)

    try:
        config = build_config(args)
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    from app.transcription.models import TranscriptionRequest
    from app.transcription.transcription_service import TranscriptionService

    service = TranscriptionService(config=config)
    result = service.transcribe(TranscriptionRequest(audio_path=args.audio))

    if args.json:
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
    else:
        print(f"status    : {result.status.value}")
        print(f"model     : {result.model_name} (profile={config.profile})")

        # Confidence diagnostic from Whisper logprobs
        logprobs = [s.avg_logprob for s in result.segments if s.avg_logprob is not None]
        if logprobs:
            mean_logprob = sum(logprobs) / len(logprobs)
            prob_est = math.exp(mean_logprob) * 100
            conf_tier = "High" if mean_logprob > -0.5 else ("Medium" if mean_logprob > -1.0 else "Low")
            print(f"confidence: {conf_tier} ({prob_est:.1f}%, avg_logprob={mean_logprob:.3f})")

        # Reference-based accuracy check (from --reference argument or companion <stem>_ref.txt)
        ref_text: str | None = None
        if args.reference:
            ref_path = Path(args.reference)
            ref_text = ref_path.read_text(encoding="utf-8").strip() if ref_path.is_file() else args.reference.strip()
        else:
            companion_ref = Path(args.audio).with_name(f"{Path(args.audio).stem}_ref.txt")
            if companion_ref.is_file():
                ref_text = companion_ref.read_text(encoding="utf-8").strip()

        if ref_text and result.transcript:
            from app.transcription.quality_report import QualityReport
            report = QualityReport.build(result, config=config, reference=ref_text)
            if report.wer is not None and report.word_accuracy_proxy is not None:
                print(f"accuracy  : {report.word_accuracy_proxy:.1f}% (WER: {report.wer * 100:.1f}%, CER: {(report.cer or 0) * 100:.1f}%) [ref-based]")

        if result.transcript:
            print(f"transcript: {result.transcript}")
        if result.error_code:
            print(f"error     : {result.error_code.value} - {result.error_message}")
    return 0 if result.status.value in ("COMPLETED", "EMPTY") else 1


if __name__ == "__main__":
    raise SystemExit(main())
