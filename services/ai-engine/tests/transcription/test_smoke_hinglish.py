"""
US-05 – Optional real-model smoke test for the Hinglish profile.

This loads the REAL Hinglish model (``fast`` quality, ~78 MB download on first
run) and runs it on one second of silence.  It proves that the Hinglish
profile loads and runs end-to-end on this machine.  It does NOT measure
accuracy - use ``scripts/evaluate_wer.py`` with your own recordings for that.

It is skipped unless explicitly enabled so that ``-m integration`` does not
download a model unexpectedly::

    set RUN_HINGLISH_SMOKE=1            (cmd)
    $env:RUN_HINGLISH_SMOKE = "1"       (PowerShell)
    python -m pytest tests/transcription/test_smoke_hinglish.py -m integration -v
"""
from __future__ import annotations

import os
import struct
import wave
from pathlib import Path

import pytest

from app.transcription.config import TranscriptionConfig
from app.transcription.models import TranscriptionRequest, TranscriptionStatus
from app.transcription.transcription_service import TranscriptionService


def _write_silence(path: Path, seconds: float = 1.0) -> Path:
    frames = int(16000 * seconds)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(struct.pack("<" + "h" * frames, *([0] * frames)))
    return path


@pytest.mark.integration
@pytest.mark.skipif(
    os.environ.get("RUN_HINGLISH_SMOKE") != "1",
    reason="Set RUN_HINGLISH_SMOKE=1 to download and run the real Hinglish model.",
)
def test_hinglish_profile_loads_real_model_and_runs(tmp_path: Path) -> None:
    config = TranscriptionConfig.hinglish("fast")
    service = TranscriptionService(config=config)
    result = service.transcribe(
        TranscriptionRequest(audio_path=str(_write_silence(tmp_path / "silence.wav")))
    )
    assert result.error_code is None, f"{result.error_code}: {result.error_message}"
    assert result.status in (TranscriptionStatus.EMPTY, TranscriptionStatus.COMPLETED)
    assert result.model_name == config.model_name


@pytest.mark.integration
@pytest.mark.skipif(
    os.environ.get("RUN_HINGLISH_SMOKE") != "1",
    reason="Set RUN_HINGLISH_SMOKE=1 to download and run the real Hinglish model.",
)
def test_hinglish_transcribe_real_operational_sense_speech(
    hinglish_audio_file: Path,
) -> None:
    """Test transcribing real technician Hinglish audio with the Hinglish profile."""
    assert hinglish_audio_file.exists(), f"Audio fixture missing at {hinglish_audio_file}"

    config = TranscriptionConfig.hinglish("fast")
    service = TranscriptionService(config=config)
    result = service.transcribe(
        TranscriptionRequest(
            audio_path=str(hinglish_audio_file),
            recording_id="hinglish-operational-sense-sample",
        )
    )

    # Status and error checks
    assert result.status == TranscriptionStatus.COMPLETED, (
        f"Expected COMPLETED, got {result.status}. Error: {result.error_code} - {result.error_message}"
    )
    assert result.error_code is None
    assert result.error_message is None

    # Transcript content verification
    assert result.transcript is not None
    text_lower = result.transcript.lower()
    for keyword in ("operational", "technician", "experience"):
        assert keyword in text_lower, f"Keyword '{keyword}' missing from transcript: '{result.transcript}'"

    # Segments and timing verification
    assert len(result.segments) > 0
    assert result.processing_duration_seconds is not None
    assert result.processing_duration_seconds > 0.0
    assert result.model_name == config.model_name
