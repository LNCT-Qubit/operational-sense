"""
US-05 – Whisper Speech-to-Text Integration
pytest fixtures shared across the transcription test suite.
"""
from __future__ import annotations

import struct
import wave
from pathlib import Path
from typing import Generator
from unittest.mock import MagicMock

import pytest

from app.transcription.config import TranscriptionConfig
from app.transcription.models import TranscriptionRequest


# ---------------------------------------------------------------------------
# Configuration fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_config() -> TranscriptionConfig:
    """Return a :class:`TranscriptionConfig` suitable for unit tests.

    Uses the ``"tiny"`` model so tests do not require a large model download,
    and ``vad_filter=False`` to simplify mock assertions.
    """
    return TranscriptionConfig(
        model_name="tiny",
        device="cpu",
        compute_type="int8",
        max_duration_seconds=30.0,
        max_file_size_bytes=15 * 1024 * 1024,
        beam_size=1,
        vad_filter=False,
    )


# ---------------------------------------------------------------------------
# Directory fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    """Return a fresh temporary directory backed by pytest's ``tmp_path``."""
    return tmp_path


# ---------------------------------------------------------------------------
# Audio file fixtures
# ---------------------------------------------------------------------------


def _write_wav(path: Path, num_frames: int = 1600) -> Path:
    """Write a minimal valid 16 kHz mono PCM-16 WAV to *path*.

    Parameters
    ----------
    path:
        Destination file path.
    num_frames:
        Number of PCM samples (frames) to write.  Defaults to 1600 (0.1 s
        of 16 kHz audio).

    Returns
    -------
    Path
        The same *path* that was written.
    """
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)       # mono
        wf.setsampwidth(2)       # 16-bit PCM
        wf.setframerate(16_000)  # 16 kHz
        # Silent frames.
        wf.writeframes(b"\x00\x00" * num_frames)
    return path


@pytest.fixture
def valid_wav_file(tmp_path: Path) -> Path:
    """Return a minimal valid 16 kHz mono PCM-16 WAV file (silent audio)."""
    return _write_wav(tmp_path / "valid.wav")


@pytest.fixture
def hinglish_audio_file() -> Path:
    """Return the path to the real Hinglish technician speech WAV fixture."""
    path = Path(__file__).parent / "fixtures" / "operational_sense_hinglish.wav"
    return path


@pytest.fixture
def empty_wav_file(tmp_path: Path) -> Path:
    """Return a 0-byte file with a ``.wav`` extension."""
    path = tmp_path / "empty.wav"
    path.write_bytes(b"")
    return path


@pytest.fixture
def corrupt_audio_file(tmp_path: Path) -> Path:
    """Return a ``.wav`` file with an invalid / corrupt header."""
    path = tmp_path / "corrupt.wav"
    # Plausible RIFF size but wrong WAVE/fmt content.
    path.write_bytes(b"RIFF\x00\x00\x00\x00JUNK\x00\x00\x00\x00")
    return path


@pytest.fixture
def unsupported_format_file(tmp_path: Path) -> Path:
    """Return a file with an unsupported extension (``.xyz``)."""
    path = tmp_path / "audio.xyz"
    path.write_bytes(b"some random bytes that look like data")
    return path


@pytest.fixture
def oversized_file(tmp_path: Path) -> Path:
    """Return a ``.wav`` file that exceeds the 15 MB size limit.

    Uses :meth:`~io.IOBase.seek` to create a sparse file efficiently;
    the actual disk usage on most file systems is minimal.
    """
    path = tmp_path / "oversized.wav"
    limit = 15 * 1024 * 1024
    # Write just over the limit.
    with path.open("wb") as fh:
        fh.seek(limit + 1)
        fh.write(b"\x00")
    return path


# ---------------------------------------------------------------------------
# Mock provider fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_whisper_provider(sample_config: TranscriptionConfig) -> MagicMock:
    """Return a :class:`~unittest.mock.MagicMock` that behaves like
    :class:`~app.transcription.whisper_provider.WhisperProvider`.

    The mock's ``transcribe`` method returns a tuple of
    ``(list[Segment], TranscriptionInfo)`` where each object exposes the
    attributes that :class:`~app.transcription.transcription_service.TranscriptionService`
    reads.
    """
    # Build a minimal Segment mock.
    segment = MagicMock()
    segment.start = 0.0
    segment.end = 2.5
    segment.text = "Hello world."

    # Build a minimal TranscriptionInfo mock.
    info = MagicMock()
    info.language = "en"
    info.language_probability = 0.98

    provider = MagicMock()
    provider.is_model_loaded.return_value = True
    provider.transcribe.return_value = ([segment], info)
    return provider


# ---------------------------------------------------------------------------
# Request fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_transcription_request(valid_wav_file: Path) -> TranscriptionRequest:
    """Return a :class:`~app.transcription.models.TranscriptionRequest`
    pointing to the shared valid WAV fixture."""
    return TranscriptionRequest(
        audio_path=str(valid_wav_file),
        recording_id="rec-001",
        transcription_id=None,  # service will generate one
        attempt_number=1,
        language_hint=None,
    )

