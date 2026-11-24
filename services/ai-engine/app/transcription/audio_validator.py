"""
US-05 – Whisper Speech-to-Text Integration
Audio validation for the transcription subsystem.

:class:`AudioValidator` performs all pre-inference checks on an audio file
before it is passed to the decoder or the Whisper model.  Validation is
intentionally strict and fails fast: an invalid file never reaches the
compute-intensive inference step.

Checks performed (in order):
1. File exists and is a regular file.
2. File has a supported extension.
3. File size is > 0 (not empty).
4. File size does not exceed the configured limit.
5. Magic-byte header matches the declared format for selected types.
6. Audio duration does not exceed the configured limit (via soundfile header).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import (
    AudioTooLongError,
    AudioValidationError,
    CorruptedAudioError,
    EmptyFileError,
    FileSizeError,
    UnsupportedFormatError,
)
from app.transcription.models import TranscriptionError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Magic-byte signatures for supported binary formats
# ---------------------------------------------------------------------------

# Each entry maps a lower-case extension to a list of (offset, bytes) pairs
# that must ALL match for the file to be considered valid.
_MAGIC_SIGNATURES: dict[str, list[tuple[int, bytes]]] = {
    ".wav": [(0, b"RIFF"), (8, b"WAVE")],
    ".mp3": [(0, b"\xff\xfb"), (0, b"\xff\xf3"), (0, b"\xff\xf2"), (0, b"ID3")],
    ".flac": [(0, b"fLaC")],
    ".ogg": [(0, b"OggS")],
}

# Extensions whose headers are not validated (container formats that are
# harder to detect reliably without a full parser).
_SKIP_MAGIC: frozenset[str] = frozenset({".m4a", ".webm", ".aac"})


def _check_mp3_magic(data: bytes) -> bool:
    """Return True if *data* starts with a recognised MP3 header."""
    if len(data) < 3:
        return False
    # ID3 tag header
    if data[:3] == b"ID3":
        return True
    # Raw MPEG sync bytes – first 11 bits set, bits 1-2 may vary.
    if len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0:
        return True
    return False


class AudioValidator:
    """Validates an audio file against the configured constraints.

    Parameters
    ----------
    config:
        :class:`~app.transcription.config.TranscriptionConfig` instance
        that supplies size limits and supported format lists.
    """

    def __init__(self, config: TranscriptionConfig) -> None:
        self._config = config
        logger.debug(
            "AudioValidator initialised (max_size=%d bytes, formats=%s)",
            config.max_file_size_bytes,
            config.supported_formats,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def validate(self, audio_path: str) -> None:
        """Validate *audio_path* against all configured constraints.

        Raises a typed :class:`~app.transcription.exceptions.AudioValidationError`
        subclass on the **first** constraint that fails; returns ``None``
        silently on success.

        Parameters
        ----------
        audio_path:
            Path to the audio file to validate.

        Raises
        ------
        AudioValidationError
            Base class – caught by callers that do not need to distinguish
            individual failure modes.
        UnsupportedFormatError
            Extension not in ``config.supported_formats``.
        EmptyFileError
            File exists but is 0 bytes.
        FileSizeError
            File exceeds ``config.max_file_size_bytes``.
        CorruptedAudioError
            Magic bytes do not match the declared format.
        """
        path = Path(audio_path)
        logger.debug("Validating audio file: %s", path.name)

        self._check_exists(path)
        self._check_format(path)
        self._check_size(path)
        self._check_magic(path)
        self._check_duration(path)

        logger.debug("Audio validation passed: %s", path.name)

    # ------------------------------------------------------------------
    # Internal checks
    # ------------------------------------------------------------------

    def _check_exists(self, path: Path) -> None:
        """Raise :class:`~app.transcription.exceptions.AudioValidationError`
        if the path does not point to an existing, readable regular file."""
        if not path.exists():
            logger.warning("Audio file not found: %s", path.name)
            raise AudioValidationError(
                error_code=TranscriptionError.FILE_NOT_FOUND,
                safe_message=f"Audio file not found: '{path.name}'.",
            )
        if not path.is_file():
            logger.warning("Audio path is not a regular file: %s", path.name)
            raise AudioValidationError(
                error_code=TranscriptionError.VALIDATION_ERROR,
                safe_message=f"Path does not point to a regular file: '{path.name}'.",
            )
        # Quick read-access probe (does not read content).
        if not os.access(path, os.R_OK):
            logger.warning("Audio file is not readable: %s", path.name)
            raise AudioValidationError(
                error_code=TranscriptionError.VALIDATION_ERROR,
                safe_message=f"Audio file is not readable: '{path.name}'.",
            )

    def _check_format(self, path: Path) -> None:
        """Raise :class:`~app.transcription.exceptions.UnsupportedFormatError`
        if the file extension is not in ``config.supported_formats``."""
        ext = path.suffix.lower()
        if ext not in self._config.supported_formats:
            logger.warning(
                "Unsupported audio format '%s': %s", ext, path.name
            )
            raise UnsupportedFormatError(path=str(path), extension=ext)

    def _check_size(self, path: Path) -> None:
        """Raise :class:`~app.transcription.exceptions.EmptyFileError` or
        :class:`~app.transcription.exceptions.FileSizeError` based on file
        size."""
        size = path.stat().st_size
        logger.debug("Audio file size: %d bytes (%s)", size, path.name)

        if size == 0:
            logger.warning("Audio file is empty: %s", path.name)
            raise EmptyFileError(path=str(path))

        if size > self._config.max_file_size_bytes:
            logger.warning(
                "Audio file too large: %d bytes > %d limit (%s)",
                size,
                self._config.max_file_size_bytes,
                path.name,
            )
            raise FileSizeError(
                path=str(path),
                actual_bytes=size,
                limit_bytes=self._config.max_file_size_bytes,
            )

    def _check_duration(self, path: Path) -> None:
        """Raise :class:`~app.transcription.exceptions.AudioTooLongError`
        if the audio stream duration exceeds ``config.max_duration_seconds``.

        Uses :func:`soundfile.info` to read the duration from the file header
        in O(1) time without decoding audio samples.  This is a defence-in-depth
        guard: a highly compressed 14 MB MP3 may contain 30+ minutes of audio
        that fits within the byte-size limit yet would cause unbounded CPU
        inference and violate the FR-08 5-second SLA.

        If ``soundfile`` cannot parse the header (e.g. for some ``.m4a`` or
        ``.webm`` containers), the check is silently skipped — the decoder
        will raise :class:`~app.transcription.exceptions.CorruptedAudioError`
        later if the file is actually unreadable.
        """
        try:
            import soundfile as sf  # type: ignore[import]

            info = sf.info(str(path))
            duration = info.duration
        except Exception:  # noqa: BLE001
            # soundfile cannot parse this container header; skip silently.
            logger.debug(
                "Duration check skipped (soundfile cannot read header): %s", path.name
            )
            return

        logger.debug(
            "Audio duration: %.2fs (%s, limit=%.0fs)",
            duration,
            path.name,
            self._config.max_duration_seconds,
        )
        if duration > self._config.max_duration_seconds:
            logger.warning(
                "Audio file too long: %.2fs > %.0fs limit (%s)",
                duration,
                self._config.max_duration_seconds,
                path.name,
            )
            raise AudioTooLongError(
                path=str(path),
                actual_seconds=duration,
                limit_seconds=self._config.max_duration_seconds,
            )

    def _check_magic(self, path: Path) -> None:
        """Raise :class:`~app.transcription.exceptions.CorruptedAudioError`
        if the file header does not match the declared format.

        Formats in :data:`_SKIP_MAGIC` are not checked here because their
        containers require a proper parser.
        """
        ext = path.suffix.lower()

        if ext in _SKIP_MAGIC:
            logger.debug(
                "Skipping magic-byte check for format '%s' (%s).", ext, path.name
            )
            return

        signatures = _MAGIC_SIGNATURES.get(ext)
        if signatures is None:
            # Extension is in supported_formats but has no magic rule – skip.
            return

        try:
            # Read enough bytes for the deepest offset we need to inspect.
            max_offset = max(offset for offset, _ in signatures)
            read_len = max_offset + 16
            with path.open("rb") as fh:
                header = fh.read(read_len)
        except OSError as exc:
            logger.warning("Cannot read header of %s: %s", path.name, type(exc).__name__)
            raise CorruptedAudioError(
                path=str(path),
                detail="File header could not be read.",
            ) from None

        if ext == ".mp3":
            # MP3 has multiple valid magic patterns; use a dedicated helper.
            if not _check_mp3_magic(header):
                logger.warning("MP3 magic mismatch: %s", path.name)
                raise CorruptedAudioError(
                    path=str(path),
                    detail="File header does not match MP3 format.",
                )
            return

        # For other formats: ALL (offset, signature) pairs must match.
        for offset, expected in signatures:
            actual = header[offset: offset + len(expected)]
            if actual != expected:
                # Before hard-failing, attempt a PyAV probe — the file may be
                # a valid audio container saved with the wrong extension (e.g.
                # an MP4/AAC saved as .flac or .ogg).
                try:
                    import av  # type: ignore[import]
                    with av.open(str(path)) as container:
                        has_audio = any(
                            s.type == "audio" for s in container.streams
                        )
                    if has_audio:
                        logger.warning(
                            "Magic mismatch for %s (expected %s header) but "
                            "PyAV found a valid audio stream — continuing.",
                            path.name,
                            ext.upper(),
                        )
                        return  # Decoder will handle it via PyAV fallback.
                except Exception:  # noqa: BLE001
                    pass

                logger.warning(
                    "Magic mismatch for %s at offset %d: expected %r, got %r",
                    path.name,
                    offset,
                    expected,
                    actual,
                )
                raise CorruptedAudioError(
                    path=str(path),
                    detail=f"File header does not match {ext.upper()} format.",
                )

