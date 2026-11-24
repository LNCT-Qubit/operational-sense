"""
Transcribe all renamed fixture files and collect results.
Outputs a JSON file for the professional report generator.
"""
import json
import time
from pathlib import Path

# Primary files to transcribe (one per unique audio content)
# When a case has both AAC and M4A (same audio, different container),
# only the most common/native format is transcribed once.
TRANSCRIBE_LIST = [
    # (filename, category, case_number, format_label)
    ("COMP_001.aac",  "Compressor", "001", "AAC"),
    ("COMP_001.m4a",  "Compressor", "001", "M4A"),
    ("COMP_002.flac", "Compressor", "002", "FLAC"),
    ("COMP_003.ogg",  "Compressor", "003", "OGG"),
    ("COMP_003.wav",  "Compressor", "003", "WAV"),
    ("COMP_004.aac",  "Compressor", "004", "AAC"),
    ("COMP_004.wav",  "Compressor", "004", "WAV"),
    ("COMP_007.wav",  "Compressor", "007", "WAV"),
    ("COMP_009.flac", "Compressor", "009", "FLAC"),
    ("COMP_010.aac",  "Compressor", "010", "AAC"),
    ("COMP_010.m4a",  "Compressor", "010", "M4A"),
    ("COMP_012.mp3",  "Compressor", "012", "MP3"),
    ("COMP_013.mp3",  "Compressor", "013", "MP3"),
    ("COMP_014.flac", "Compressor", "014", "FLAC"),
    ("COMP_015.flac", "Compressor", "015", "FLAC"),
    ("MOT_005.aac",   "Motor",      "005", "AAC"),
    ("MOT_005.m4a",   "Motor",      "005", "M4A"),
    ("MOT_006.aac",   "Motor",      "006", "AAC"),
    ("MOT_006.webm",  "Motor",      "006", "WEBM"),
    ("MOT_017.aac",   "Motor",      "017", "AAC"),
    ("MOT_017.m4a",   "Motor",      "017", "M4A"),
    ("PUMP_011.mp3",  "Pump",       "011", "MP3"),
    ("PUMP_014.mp3",  "Pump",       "014", "MP3"),
]

FIXTURES = Path("tests/transcription/fixtures")

import sys, os
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.transcription.config import TranscriptionConfig
from app.transcription.transcription_service import TranscriptionService
from app.transcription.models import TranscriptionRequest

cfg = TranscriptionConfig.hinglish(quality="fast")
service = TranscriptionService(config=cfg)

results = []
total = len(TRANSCRIBE_LIST)

print(f"Transcribing {total} files...\n")

for i, (fname, category, case_num, fmt) in enumerate(TRANSCRIBE_LIST, 1):
    path = str(FIXTURES / fname)
    file_size = os.path.getsize(path)
    print(f"[{i:2d}/{total}] {fname} ({fmt})...", end=" ", flush=True)

    t0 = time.time()
    res = service.transcribe(TranscriptionRequest(audio_path=path))
    elapsed = time.time() - t0

    # Collect segment diagnostics
    logprobs = [s.avg_logprob for s in res.segments if s.avg_logprob is not None]
    no_speech = [s.no_speech_prob for s in res.segments if s.no_speech_prob is not None]
    avg_logprob = sum(logprobs) / len(logprobs) if logprobs else None
    avg_no_speech = sum(no_speech) / len(no_speech) if no_speech else None

    import math
    conf_pct = round(math.exp(avg_logprob) * 100, 1) if avg_logprob is not None else None
    conf_tier = None
    if avg_logprob is not None:
        conf_tier = "High" if avg_logprob > -0.5 else ("Medium" if avg_logprob > -1.0 else "Low")

    record = {
        "file": fname,
        "category": category,
        "case_number": case_num,
        "format": fmt,
        "file_size_kb": file_size // 1024,
        "status": res.status.value,
        "transcript": res.transcript,
        "detected_language": res.detected_language,
        "language_probability": round(res.language_probability, 4) if res.language_probability else None,
        "num_segments": len(res.segments),
        "avg_logprob": round(avg_logprob, 4) if avg_logprob is not None else None,
        "avg_no_speech_prob": round(avg_no_speech, 6) if avg_no_speech is not None else None,
        "confidence_pct": conf_pct,
        "confidence_tier": conf_tier,
        "processing_seconds": round(elapsed, 2),
        "word_count": len(res.transcript.split()) if res.transcript else 0,
        "error_code": res.error_code.value if res.error_code else None,
        "error_message": res.error_message,
    }
    results.append(record)

    status_sym = "OK" if res.status.value == "COMPLETED" else "FAIL"
    print(f"[{status_sym}] {conf_tier or '-'} ({conf_pct or '-'}%) | {elapsed:.1f}s | {len(res.transcript.split()) if res.transcript else 0} words")

# Save JSON
out = Path("scripts/fixture_transcriptions.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"\nResults saved to: {out}")
