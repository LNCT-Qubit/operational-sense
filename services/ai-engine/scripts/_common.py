"""Shared helpers for the US-05 command-line tools."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Make ``import app...`` work when a script is run from any directory.
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def add_config_args(parser: argparse.ArgumentParser) -> None:
    """Add the model/profile options shared by all scripts."""
    parser.add_argument(
        "--profile",
        choices=["default", "hinglish"],
        help="Config profile (default: TRANSCRIPTION_PROFILE or 'default').",
    )
    parser.add_argument(
        "--quality",
        choices=["accurate", "fast"],
        help="Hinglish model size: 'accurate' (larger) or 'fast' (small).",
    )
    parser.add_argument("--model", help="Model size, Hugging Face repo id or local dir.")
    parser.add_argument(
        "--language",
        help="Language code (empty string '' = auto-detect). Hinglish uses 'en'.",
    )
    parser.add_argument("--model-dir", help="Model download / cache directory.")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Never use the network (model must already be downloaded).",
    )
    parser.add_argument(
        "--no-vad",
        action="store_true",
        help="Disable VAD filtering (useful for noisy audio where speech may be cut off).",
    )


def build_config(args: argparse.Namespace):
    """Build a TranscriptionConfig from env vars overridden by CLI options."""
    if getattr(args, "no_vad", False):
        os.environ["TRANSCRIPTION_VAD_FILTER"] = "0"
    if args.profile:
        os.environ["TRANSCRIPTION_PROFILE"] = args.profile
    if args.quality:
        os.environ["TRANSCRIPTION_HINGLISH_QUALITY"] = args.quality
    if args.model:
        os.environ["TRANSCRIPTION_MODEL_NAME"] = args.model
    if args.language is not None:
        os.environ["TRANSCRIPTION_LANGUAGE"] = args.language
    if args.model_dir:
        os.environ["TRANSCRIPTION_MODEL_DIR"] = args.model_dir
    if args.offline:
        os.environ["TRANSCRIPTION_LOCAL_FILES_ONLY"] = "true"

    from app.transcription.config import TranscriptionConfig

    return TranscriptionConfig.from_env()
