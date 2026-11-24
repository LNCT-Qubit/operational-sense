"""
US-05 Integration Interface.

This module is the stable entry point for other components to invoke
the transcription engine. It isolates the caller from internal implementation
details.

Integration dependency note:
  The backend service (TypeScript) owns the HTTP route that receives audio
  uploads (US-04). Once the backend calls this interface (or a comparable
  IPC mechanism agreed with the backend owner), it should pass a local file
  path and a recording_id. This interface returns a TranscriptionResult that
  the backend owner can persist and relay to the frontend.

  The integration boundary is: backend passes file path + recording_id,
  this module returns a TranscriptionResult. Persistence, retry scheduling,
  and HTTP response formatting are the backend owner's responsibility.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

from app.transcription.config import TranscriptionConfig
from app.transcription.models import TranscriptionRequest, TranscriptionResult
from app.transcription.transcription_service import TranscriptionService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Module-level singleton state
# ---------------------------------------------------------------------------

_service_instance: Optional[TranscriptionService] = None
_service_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get_service(
    config: Optional[TranscriptionConfig] = None,
) -> TranscriptionService:
    """Return the module-level :class:`~app.transcription.transcription_service.TranscriptionService` singleton.

    The service is lazily initialised on the first call.  Subsequent calls
    return the same instance regardless of the ``config`` argument; the
    configuration supplied on the first call wins.

    Thread safety is guaranteed by an internal ``threading.Lock``.

    Parameters
    ----------
    config:
        Optional configuration to use when initialising the service for the
        first time.  If ``None``, :class:`~app.transcription.config.TranscriptionConfig`
        defaults apply.

    Returns
    -------
    TranscriptionService
        The shared service instance.
    """
    global _service_instance  # noqa: PLW0603

    if _service_instance is not None:
        return _service_instance

    with _service_lock:
        # Double-checked locking.
        if _service_instance is None:
            logger.debug("Initialising TranscriptionService singleton.")
            _service_instance = TranscriptionService(config=config)
    return _service_instance


def transcribe_audio(
    audio_path: str,
    recording_id: Optional[str] = None,
    transcription_id: Optional[str] = None,
    attempt_number: int = 1,
    language_hint: Optional[str] = None,
    config: Optional[TranscriptionConfig] = None,
) -> TranscriptionResult:
    """Convenience function: validate, decode, and transcribe *audio_path*.

    This is the primary callable intended for use by integration code.  It
    delegates to the shared :class:`~app.transcription.transcription_service.TranscriptionService`
    singleton so the Whisper model is loaded only once per process.

    Parameters
    ----------
    audio_path:
        Absolute (or resolvable) path to the audio file on the local
        filesystem.
    recording_id:
        Backend recording identifier to associate with the result.
    transcription_id:
        Pre-generated UUID for this attempt.  When ``None``, the service
        generates one automatically.
    attempt_number:
        1-based retry counter; recorded in the result for observability.
    language_hint:
        Optional BCP-47 language code to pass to Whisper's decoder.  ``None``
        activates automatic language detection.
    config:
        Configuration used when initialising the service for the **first**
        time.  Ignored on subsequent calls (singleton semantics).

    Returns
    -------
    TranscriptionResult
        Always returned; never raises.  Inspect ``.status`` for outcome.
    """
    service = get_service(config=config)
    request = TranscriptionRequest(
        audio_path=audio_path,
        recording_id=recording_id,
        transcription_id=transcription_id,
        attempt_number=attempt_number,
        language_hint=language_hint,
    )
    return service.transcribe(request)


def reset_service() -> None:
    """Reset the module-level singleton.

    **For testing purposes only.**  Clears the cached
    :class:`~app.transcription.transcription_service.TranscriptionService`
    so that the next call to :func:`get_service` or :func:`transcribe_audio`
    creates a fresh instance.

    This function is **not** safe to call in a production environment while
    concurrent requests may be in-flight.
    """
    global _service_instance  # noqa: PLW0603
    with _service_lock:
        _service_instance = None
    logger.debug("TranscriptionService singleton reset.")

