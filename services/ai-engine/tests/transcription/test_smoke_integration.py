"""
Integration smoke test for US-05.

Requires: faster-whisper installed, model downloaded.
Run with: pytest -m integration

Not included in standard CI test run.
"""
from __future__ import annotations

import wave
from pathlib import Path

import pytest

from app.transcription.config import TranscriptionConfig
from app.transcription.models import TranscriptionStatus
from app.transcription.transcription_service import TranscriptionService


def _generate_known_speech_wav(path: Path, spoken_text: str) -> Path:
    """Generate a clean speech WAV file containing *spoken_text*.

    Uses Windows Speech Synthesis on Windows hosts.
    """
    import platform
    import subprocess

    if platform.system() == "Windows":
        ps_script = f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile('{path.resolve()}')
$synth.Speak('{spoken_text}')
$synth.Dispose()
"""
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=25,
        )
        if proc.returncode == 0 and path.exists() and path.stat().st_size > 0:
            return path

    raise RuntimeError(
        "Known speech audio could not be generated: Windows Speech Synthesis unavailable."
    )


def _write_silent_wav(path: Path, duration_seconds: float = 1.0) -> Path:
    """Write a silent 16 kHz mono PCM-16 WAV file of *duration_seconds*."""
    sample_rate = 16_000
    num_frames = int(sample_rate * duration_seconds)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"\x00\x00" * num_frames)
    return path


@pytest.mark.integration
def test_smoke_silent_wav_returns_empty_or_completed(tmp_path: Path) -> None:
    """
    Smoke test: transcribe 1 second of silence.

    * result.status must be EMPTY (no speech) or COMPLETED.
    * result.processing_duration_seconds must be > 0.
    * result.error_code must be None.

    This test loads the real faster-whisper ``tiny`` model from the local
    cache (~75 MB download on first run).  It is excluded from the standard
    test suite and must be explicitly selected with ``-m integration``.
    """
    silent_wav = _write_silent_wav(tmp_path / "silence.wav", duration_seconds=1.0)

    config = TranscriptionConfig(
        model_name="tiny",
        device="cpu",
        compute_type="int8",
        vad_filter=True,
    )
    service = TranscriptionService(config=config)

    from app.transcription.models import TranscriptionRequest
    request = TranscriptionRequest(
        audio_path=str(silent_wav),
        recording_id="smoke-test-recording",
        attempt_number=1,
    )
    result = service.transcribe(request)

    # Must be EMPTY (silence) or COMPLETED (if the model hallucinates text).
    assert result.status in (TranscriptionStatus.EMPTY, TranscriptionStatus.COMPLETED), (
        f"Unexpected status: {result.status}. error_code={result.error_code}, "
        f"error_message={result.error_message}"
    )
    assert result.processing_duration_seconds is not None
    assert result.processing_duration_seconds > 0, (
        "processing_duration_seconds must be positive."
    )
    assert result.error_code is None, (
        f"Smoke test failed with error: {result.error_code}: {result.error_message}"
    )
    assert result.model_name == "tiny"
    assert result.transcription_id is not None


@pytest.mark.integration
def test_known_speech_transcription_returns_completed_with_matching_text(tmp_path: Path) -> None:
    """
    Known-speech functional integration test:
    Transcribe known spoken English sentence using the actual faster-whisper-tiny model.

    Sentence:
    'The pump is vibrating excessively and making an unusual noise.'

    Verifies:
    1. Real model loads and completes inference without exceptions.
    2. Result status is COMPLETED.
    3. Transcript is non-empty.
    4. Recognized text is consistent with the known spoken sentence.
    5. Language metadata is detected as English ('en').
    6. Segment timing and processing duration are populated.
    7. Temporary files are cleaned up and original audio is preserved.
    """
    import glob
    import tempfile

    spoken_sentence = "The pump is vibrating excessively and making an unusual noise."
    speech_wav = tmp_path / "known_speech.wav"
    try:
        _generate_known_speech_wav(speech_wav, spoken_sentence)
    except Exception as exc:
        pytest.skip(f"Known speech generation unavailable: {exc}")

    assert speech_wav.exists() and speech_wav.stat().st_size > 0, "Speech sample was not created."

    # Track temp directory state before inference
    temp_dir = tempfile.gettempdir()
    pre_temps = set(glob.glob(str(Path(temp_dir) / "ops_transcription_*.wav")))

    config = TranscriptionConfig(
        model_name="tiny",
        device="cpu",
        compute_type="int8",
        vad_filter=True,
    )
    service = TranscriptionService(config=config)

    from app.transcription.models import TranscriptionRequest
    request = TranscriptionRequest(
        audio_path=str(speech_wav),
        recording_id="speech-integration-rec",
        attempt_number=1,
    )
    result = service.transcribe(request)

    # 1. Pipeline outcome
    assert result.status == TranscriptionStatus.COMPLETED, (
        f"Expected COMPLETED, got {result.status}. Error: {result.error_code} - {result.error_message}"
    )
    assert result.error_code is None
    assert result.error_message is None

    # 2. Non-empty transcript
    assert result.transcript is not None, "Transcript must not be None."
    transcript_clean = result.transcript.strip().lower()
    assert len(transcript_clean) > 0, "Transcript must not be empty."

    # 3. Known spoken content verification (keyword presence)
    key_terms = ["pump", "vibrat", "excessiv", "unusual", "noise"]
    matches = [term for term in key_terms if term in transcript_clean]
    assert len(matches) >= 3, (
        f"Recognized text '{result.transcript}' does not match expected terms {key_terms}. "
        f"Matched only: {matches}"
    )

    # 4. Language metadata verification
    assert result.detected_language == "en", (
        f"Expected detected_language 'en', got '{result.detected_language}'"
    )
    assert result.language_probability is not None
    assert result.language_probability > 0.7, (
        f"Expected language probability > 0.7, got {result.language_probability}"
    )

    # 5. Segment metadata verification
    assert len(result.segments) > 0, "At least one speech segment must be returned."
    for seg in result.segments:
        assert seg.start >= 0.0, "Segment start time must be non-negative."
        assert seg.end > seg.start, "Segment end must be greater than start."
        assert len(seg.text.strip()) > 0, "Segment text must be non-empty."

    # 6. Model metadata & duration
    assert result.model_name == "tiny"
    assert result.transcription_id is not None
    assert result.processing_duration_seconds is not None
    assert result.processing_duration_seconds > 0.0

    # 7. Resource & file cleanup verification
    # Source file must be preserved
    assert speech_wav.exists(), "Original audio file must be preserved."
    # Temporary files created by AudioDecoder during the run must be cleaned up
    post_temps = set(glob.glob(str(Path(temp_dir) / "ops_transcription_*.wav")))
    new_leaked_temps = post_temps - pre_temps
    assert len(new_leaked_temps) == 0, f"Leaked temporary audio files detected: {new_leaked_temps}"

