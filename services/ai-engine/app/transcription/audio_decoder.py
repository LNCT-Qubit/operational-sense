"""
US-05 – Whisper Speech-to-Text Integration
Audio decoding / format conversion for the transcription subsystem.

:class:`AudioDecoder` accepts a validated audio file path and returns a path
to a temporary WAV file that is ready for direct ingestion by faster-whisper.

Design decisions
----------------
* WAV files that are already 16 kHz, mono, PCM-16 are returned **as-is**
  (zero-copy path) to avoid unnecessary disk I/O.
* All other formats are decoded via ``soundfile`` and resampled to 16 kHz
  mono via ``numpy``.  The result is written to a temporary WAV so that
  faster-whisper receives a consistent input format.
* Temporary files are tracked by the instance and cleaned up on
  :meth:`cleanup` or at context-manager exit.  The **original** file is
  never modified.
"""
from __future__ import annotations

import logging
import os
import struct
import tempfile
from pathlib import Path
from typing import Optional

from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import CorruptedAudioError

logger = logging.getLogger(__name__)

# Target sample rate for faster-whisper.
_TARGET_SAMPLE_RATE = 16_000


def _is_16k_mono_pcm_wav(path: Path) -> bool:
    """Return *True* if *path* is a standard 16 kHz, mono, PCM-16 WAV file.

    Performs a lightweight header parse (first 44 bytes) so the caller can
    skip the full decode step when possible.

    Parameters
    ----------
    path:
        Path to the WAV file.

    Returns
    -------
    bool
        ``True`` if the file header confirms 16 kHz / mono / PCM-16;
        ``False`` if the header indicates a different spec or cannot be read.
    """
    try:
        with path.open("rb") as fh:
            header = fh.read(44)
        if len(header) < 44:
            return False
        # Verify RIFF/WAVE magic.
        if header[0:4] != b"RIFF" or header[8:12] != b"WAVE":
            return False
        # fmt chunk tag.
        if header[12:16] != b"fmt ":
            return False
        audio_format = struct.unpack_from("<H", header, 20)[0]  # 1 = PCM
        num_channels = struct.unpack_from("<H", header, 22)[0]
        sample_rate = struct.unpack_from("<I", header, 24)[0]
        bits_per_sample = struct.unpack_from("<H", header, 34)[0]
        return (
            audio_format == 1
            and num_channels == 1
            and sample_rate == _TARGET_SAMPLE_RATE
            and bits_per_sample == 16
        )
    except Exception:  # noqa: BLE001
        return False


class AudioDecoder:
    """Prepares an audio file for faster-whisper inference.

    The decoder guarantees that:
    * The returned path always points to a valid 16 kHz mono PCM WAV file.
    * The original input file is **never** modified.
    * Any temporary files created are removed on :meth:`cleanup`.

    Parameters
    ----------
    config:
        :class:`~app.transcription.config.TranscriptionConfig` instance
        (currently used for future extensibility and logging context).
    """

    def __init__(self, config: TranscriptionConfig) -> None:
        self._config = config
        self._temp_paths: list[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def prepare_audio(self, audio_path: str) -> str:
        """Return a path to a WAV file ready for faster-whisper.

        If *audio_path* already satisfies the 16 kHz / mono / PCM-16
        requirement, the same path is returned (zero-copy).  Otherwise the
        file is decoded and resampled into a temporary WAV.

        Parameters
        ----------
        audio_path:
            Path to the validated source audio file.

        Returns
        -------
        str
            Path to the prepared audio (may equal *audio_path*).

        Raises
        ------
        CorruptedAudioError
            If the file cannot be decoded by soundfile.
        """
        path = Path(audio_path)

        # Fast path: already the right format.
        if path.suffix.lower() == ".wav" and _is_16k_mono_pcm_wav(path):
            logger.debug("Audio is already 16 kHz mono PCM – using directly: %s", path.name)
            return audio_path

        logger.debug(
            "Converting audio to 16 kHz mono PCM WAV: %s", path.name
        )
        return self._convert_to_wav(path)

    def cleanup(self) -> None:
        """Delete all temporary files created by this instance.

        Safe to call multiple times; a file that has already been removed
        is silently ignored.  The original source file is **never** touched.
        """
        for temp_path in self._temp_paths:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    logger.debug("Cleaned up temp file: %s", os.path.basename(temp_path))
            except OSError as exc:  # pragma: no cover
                logger.warning(
                    "Could not remove temp file %s: %s",
                    os.path.basename(temp_path),
                    type(exc).__name__,
                )
        self._temp_paths.clear()

    # ------------------------------------------------------------------
    # Context manager
    # ------------------------------------------------------------------

    def __enter__(self) -> "AudioDecoder":
        return self

    def __exit__(self, exc_type: object, exc_val: object, exc_tb: object) -> None:
        self.cleanup()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _convert_to_wav(self, path: Path) -> str:
        """Decode *path* with soundfile + numpy and write a 16 kHz mono WAV.

        Parameters
        ----------
        path:
            Source audio file.

        Returns
        -------
        str
            Path to the temporary WAV file.

        Raises
        ------
        CorruptedAudioError
            If soundfile cannot read the file.
        """
        try:
            import soundfile as sf  # type: ignore[import]
            import numpy as np  # type: ignore[import]
        except ImportError as exc:  # pragma: no cover
            raise CorruptedAudioError(
                path=str(path),
                detail="Audio processing libraries (soundfile/numpy) are not available.",
            ) from exc

        # --- Decode ---
        try:
            data, sample_rate = sf.read(
                str(path), dtype="float32", always_2d=True
            )
        except Exception as sf_exc:  # noqa: BLE001
            logger.warning(
                "soundfile could not read '%s': %s. Trying PyAV fallback.",
                path.name,
                type(sf_exc).__name__,
            )
            try:
                import av  # type: ignore[import]

                decoded_audio = []
                with av.open(str(path)) as container:
                    audio_stream = next(
                        (
                            stream
                            for stream in container.streams
                            if stream.type == "audio"
                        ),
                        None,
                    )
                    if audio_stream is None:
                        raise ValueError("No audio stream found.")
                    resampler = av.AudioResampler(
                        format="flt",
                        layout="mono",
                        rate=_TARGET_SAMPLE_RATE,
                    )
                    for frame in container.decode(audio_stream):
                        for r_frame in resampler.resample(frame):
                            decoded_audio.append(r_frame.to_ndarray())
                    for r_frame in resampler.resample(None):
                        decoded_audio.append(r_frame.to_ndarray())

                if not decoded_audio:
                    raise ValueError("No audio frames decoded.")

                data = np.concatenate(decoded_audio, axis=1).T
                sample_rate = _TARGET_SAMPLE_RATE
            except Exception as av_exc:  # noqa: BLE001
                logger.warning(
                    "PyAV fallback also failed for '%s': %s",
                    path.name,
                    type(av_exc).__name__,
                )
                raise CorruptedAudioError(
                    path=str(path),
                    detail="File could not be decoded as audio.",
                ) from None

        # --- Mix down to mono ---
        if data.shape[1] > 1:
            data = data.mean(axis=1)
        else:
            data = data[:, 0]

        # --- Resample to 16 kHz if necessary ---
        if sample_rate != _TARGET_SAMPLE_RATE:
            data = self._resample(data, sample_rate, _TARGET_SAMPLE_RATE)

        # --- Convert to int16 PCM ---
        # Clip to [-1.0, 1.0] before scaling.  Lossy-encoded audio (MP3, OGG,
        # AAC) regularly produces inter-sample peaks slightly above ±1.0 (e.g.
        # 1.002).  Without clipping, multiplying by 32767 yields a value that
        # overflows signed int16 on cast, producing large-magnitude wrap-around
        # artifacts (digital clipping) in the output WAV.
        data_int16: np.ndarray = np.clip(
            data * 32767.0, -32768.0, 32767.0
        ).astype(np.int16)

        # --- Write temp WAV ---
        tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="ops_transcription_")
        os.close(tmp_fd)
        try:
            sf.write(tmp_path, data_int16, _TARGET_SAMPLE_RATE, subtype="PCM_16")
        except Exception as exc:  # noqa: BLE001  # pragma: no cover
            os.remove(tmp_path)
            raise CorruptedAudioError(
                path=str(path),
                detail="Failed to write decoded audio to temporary file.",
            ) from None

        self._temp_paths.append(tmp_path)
        logger.debug(
            "Wrote converted WAV to temp file (sample_rate=%d → %d, channels→1).",
            sample_rate,
            _TARGET_SAMPLE_RATE,
        )
        return tmp_path

    @staticmethod
    def _resample(
        data: "np.ndarray",  # type: ignore[name-defined]
        orig_sr: int,
        target_sr: int,
    ) -> "np.ndarray":  # type: ignore[name-defined]
        """Band-limited (anti-aliased) resample using FFT low-pass.

        The previous implementation used plain linear interpolation, which
        folds energy above the new Nyquist frequency back into the speech band
        (aliasing) when downsampling 44.1 / 48 kHz recordings to 16 kHz.  That
        hurts recognition accuracy.  This version resamples in the frequency
        domain: everything above ``target_sr / 2`` is removed before the
        signal is re-sampled.  It needs only numpy (no extra dependency).

        The signal is reflect-padded first so that the implicit periodicity of
        the FFT does not create edge artefacts.

        Parameters
        ----------
        data:
            1-D float32 numpy array of audio samples.
        orig_sr:
            Original sample rate in Hz.
        target_sr:
            Target sample rate in Hz.

        Returns
        -------
        numpy.ndarray
            Resampled float32 array.
        """
        import math

        import numpy as np  # type: ignore[import]

        if orig_sr == target_sr or len(data) == 0:
            return np.asarray(data, dtype=np.float32)

        g = math.gcd(int(orig_sr), int(target_sr))
        up, down = int(target_sr) // g, int(orig_sr) // g

        n = len(data)
        out_len = int(n * target_sr / orig_sr)
        if out_len <= 0:
            return np.zeros(0, dtype=np.float32)

        # Pad length must be a multiple of ``down`` so that the padded signal
        # maps to an integer number of output samples.
        pad = down * max(1, math.ceil(512 / down))
        padded = np.pad(np.asarray(data, dtype=np.float64), pad, mode="reflect")
        m = len(padded)
        m_ext = int(math.ceil(m / down) * down)
        if m_ext != m:
            padded = np.pad(padded, (0, m_ext - m), mode="edge")
            m = m_ext
        out_pad = m // down * up

        spectrum = np.fft.rfft(padded)
        n_out_bins = out_pad // 2 + 1
        shaped = np.zeros(n_out_bins, dtype=np.complex128)
        keep = min(n_out_bins, len(spectrum))
        shaped[:keep] = spectrum[:keep]
        if target_sr < orig_sr and out_pad % 2 == 0:
            shaped[-1] = 0.0  # drop the ambiguous Nyquist bin

        resampled_pad = np.fft.irfft(shaped, n=out_pad) * (out_pad / m)

        start = pad // down * up
        resampled = resampled_pad[start : start + out_len].astype(np.float32)
        return resampled

