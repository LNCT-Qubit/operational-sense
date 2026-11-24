"""Measure Word Error Rate (WER) on your own recordings.

Create a CSV with columns ``audio,reference`` (see manifest_template.csv),
then run from ``services/ai-engine``::

    python scripts/evaluate_wer.py my_clips/manifest.csv --profile hinglish
    python scripts/evaluate_wer.py my_clips/manifest.csv --model small --language hi

Run it once per candidate model/profile and compare the corpus WER.  Use at
least 20-30 clips that resemble real technician recordings (phone quality,
workshop noise, your accents).  Do not quote accuracy numbers without this.
"""
from __future__ import annotations

import argparse
import json
import sys

from _common import add_config_args, build_config


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="US-05 WER evaluation")
    parser.add_argument("manifest", help="CSV with 'audio' and 'reference' columns.")
    parser.add_argument("--json", metavar="FILE", help="Also write the full report to FILE.")
    add_config_args(parser)
    args = parser.parse_args(argv)

    try:
        config = build_config(args)
    except ValueError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 2

    from app.transcription.evaluation import evaluate_rows, load_manifest
    from app.transcription.models import TranscriptionRequest
    from app.transcription.transcription_service import TranscriptionService

    rows = load_manifest(args.manifest)
    if not rows:
        print("Manifest has no rows.", file=sys.stderr)
        return 2

    service = TranscriptionService(config=config)

    def run(path: str):
        return service.transcribe(TranscriptionRequest(audio_path=path))

    report = evaluate_rows(rows, run)

    print(f"model={config.model_name} profile={config.profile} language={config.language}")
    for item in report.items:
        print(f"- WER {item.wer:5.2f} [{item.status}] {item.audio_path}")
        print(f"    ref: {item.reference}")
        print(f"    hyp: {item.hypothesis}")
    wer = report.corpus_wer
    print(f"\nSamples: {len(report.items)}  Corpus WER: "
          f"{'n/a' if wer is None else f'{wer:.3f} ({wer*100:.1f}%)'}")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(report.to_dict(), fh, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
