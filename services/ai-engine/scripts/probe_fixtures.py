"""Probe all fixture audio files for format and duration info."""
import soundfile as sf
from pathlib import Path

FIXTURES = Path("tests/transcription/fixtures")

CASE_FILES = [
    "CASE-COMP-001.aac",
    "CASE-COMP-001.m4a",
    "CASE-COMP-002.flac",
    "CASE-COMP-003.ogg",
    "CASE-COMP-003.wav",
    "CASE-COMP-007.wav",
    "CASE-COMP-009.flac",
    "CASE-COMP-013.mp3",
    "CASE-COMP-014.flac",
    "CASE-COMP-015.flac",
    "CASE-MOT-017.aac",
    "CASE-MOT-017.m4a",
    "CASE_COMP-004.aac",
    "CASE_COMP-004.wav",
    "CASE_COMP-012.mp3",
    "CASE_COMP-10.aac",
    "CASE_COMP-10.m4a",
    "CASE_MOT-005.aac",
    "CASE_MOT-005.m4a",
    "CASE_MOT-006.aac",
    "CASE_MOT-006.webm",
    "CASE_PUMP-011.mp3",
    "CASE_PUMP-014.mp3",
]

for name in CASE_FILES:
    path = FIXTURES / name
    ext = path.suffix.upper().lstrip(".")
    size_kb = path.stat().st_size // 1024
    try:
        info = sf.info(str(path))
        dur = f"{info.duration:.2f}s"
        sr = f"{info.samplerate}Hz"
        ch = f"{info.channels}ch"
    except Exception:
        dur, sr, ch = "[PyAV needed]", "-", "-"
    print(f"{name:<40s} {ext:<6s} {size_kb:>6d}KB  {dur:<12s} {sr:<10s} {ch}")
