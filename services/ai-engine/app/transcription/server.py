"""
HTTP wrapper around the US-05 transcription engine (used by the Node backend, Sprint 2 Block 3).

Run from ``services/ai-engine``::

    python -m app.transcription.server

Contract (matches ``services/backend/src/modules/transcription/transcription.client.ts``):

* ``GET  /health``      -> 200 ``{"status": "ok"}`` (does NOT load the Whisper model).
* ``POST /transcribe``  -> JSON body ``{audio_path, recording_id, transcription_id, attempt_number}``.
  Returns 200 with a ``TranscriptionResult`` (``COMPLETED`` / ``EMPTY`` / ``FAILED`` are all normal 200
  responses: they are domain outcomes). Transport-level problems use 4xx/5xx and are treated by the backend
  as "transcription service unavailable" (retryable).

Security:

* Only files that resolve INSIDE ``TRANSCRIPTION_AUDIO_ROOT`` are read (symlinks and ``..`` are resolved first),
  otherwise 403. The backend and this service must therefore share the upload directory.
* If ``TRANSCRIBER_INTERNAL_TOKEN`` is set, every ``/transcribe`` call must send the same value in
  ``X-Internal-Token`` (constant-time comparison). Bind to 127.0.0.1 (the default) unless a network
  boundary protects the port.
* Error responses never contain stack traces or file-system details.

Only the Python standard library is used for HTTP, so no new dependency is introduced.

Environment variables (besides the ``TRANSCRIPTION_*`` ones read by ``TranscriptionConfig.from_env``):
    AI_ENGINE_HOST                 bind address (default 127.0.0.1)
    AI_ENGINE_PORT                 port (default 8000)
    TRANSCRIPTION_AUDIO_ROOT       directory that holds uploaded audio (required to transcribe anything)
    TRANSCRIBER_INTERNAL_TOKEN     optional shared secret (same variable name as the backend)
"""
from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()


import hmac
import json
import logging
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Optional

from app.transcription.config import TranscriptionConfig

logger = logging.getLogger("app.transcription.server")

MAX_BODY_BYTES = 16 * 1024          # the request is a few ids and a path; anything bigger is a mistake/attack
_UUID_LIKE = 64                     # ids are echoed back; cap their length defensively

TranscribeFn = Callable[..., Any]


def _is_inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


class TranscriptionHTTPServer(ThreadingHTTPServer):
    """Holds the settings the request handler needs (no module-level globals, so tests can build many)."""

    daemon_threads = True

    def __init__(
        self,
        address: tuple[str, int],
        *,
        audio_root: Optional[str],
        internal_token: Optional[str],
        transcribe: Optional[TranscribeFn] = None,
        config: Optional[TranscriptionConfig] = None,
    ) -> None:
        super().__init__(address, _Handler)
        self.audio_root: Optional[Path] = Path(audio_root).resolve() if audio_root else None
        self.internal_token = internal_token or None
        self._transcribe = transcribe
        self._config = config
        # One Whisper model, CPU-bound: run one transcription at a time instead of thrashing the CPU.
        self.transcribe_lock = threading.Lock()

    def run_transcription(self, **kwargs: Any) -> dict:
        fn = self._transcribe
        if fn is None:
            from app.transcription.interface import transcribe_audio  # lazy: importing it must not load Whisper
            fn = transcribe_audio
            kwargs["config"] = self._config
        with self.transcribe_lock:
            result = fn(**kwargs)
        return result.to_dict() if hasattr(result, "to_dict") else result


class _Handler(BaseHTTPRequestHandler):
    server: TranscriptionHTTPServer
    protocol_version = "HTTP/1.1"
    server_version = "us05-transcriber"
    sys_version = ""

    # -- helpers ---------------------------------------------------------------------------------------------
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, code: str, message: str) -> None:
        self._send(status, {"error": {"code": code, "message": message}})

    def log_message(self, fmt: str, *args: Any) -> None:  # route access logs through logging, no client data
        logger.debug("%s %s", self.command, self.path.split("?")[0])

    # -- routes ----------------------------------------------------------------------------------------------
    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        if self.path.split("?")[0] == "/health":
            self._send(200, {"status": "ok"})
        else:
            self._error(404, "NOT_FOUND", "No such route")

    def do_POST(self) -> None:  # noqa: N802
        if self.path.split("?")[0] != "/transcribe":
            self._error(404, "NOT_FOUND", "No such route")
            return

        token = self.server.internal_token
        if token and not hmac.compare_digest(self.headers.get("X-Internal-Token", ""), token):
            self._error(401, "UNAUTHORIZED", "Missing or invalid internal token")
            return

        try:
            length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._error(411, "LENGTH_REQUIRED", "Content-Length is required")
            return
        if length < 0 or length > MAX_BODY_BYTES:
            self._error(413, "PAYLOAD_TOO_LARGE", "Request body is too large")
            return
        try:
            body = json.loads(self.rfile.read(length) or b"null")
        except (ValueError, UnicodeDecodeError):
            self._error(400, "INVALID_JSON", "Body must be valid JSON")
            return
        if not isinstance(body, dict):
            self._error(400, "INVALID_BODY", "Body must be a JSON object")
            return

        audio_path = body.get("audio_path")
        if not isinstance(audio_path, str) or not audio_path.strip() or "\x00" in audio_path:
            self._error(400, "INVALID_BODY", "audio_path is required")
            return
        attempt = body.get("attempt_number", 1)
        if isinstance(attempt, bool) or not isinstance(attempt, int) or attempt < 1:
            self._error(400, "INVALID_BODY", "attempt_number must be a positive integer")
            return
        ids: dict[str, Optional[str]] = {}
        for key in ("recording_id", "transcription_id"):
            v = body.get(key)
            if v is not None and (not isinstance(v, str) or len(v) > _UUID_LIKE):
                self._error(400, "INVALID_BODY", f"{key} must be a short string")
                return
            ids[key] = v

        root = self.server.audio_root
        if root is None:
            self._error(503, "AUDIO_ROOT_NOT_CONFIGURED", "TRANSCRIPTION_AUDIO_ROOT is not configured")
            return
        resolved = Path(audio_path).resolve()          # collapses '..' and follows symlinks BEFORE the check
        if not _is_inside(root, resolved):
            logger.warning("refused a path outside the audio root")
            self._error(403, "PATH_NOT_ALLOWED", "audio_path is outside the allowed audio directory")
            return

        try:
            result = self.server.run_transcription(
                audio_path=str(resolved),
                recording_id=ids["recording_id"],
                transcription_id=ids["transcription_id"],
                attempt_number=attempt,
            )
        except Exception:  # the engine is documented as never raising; this is the last line of defence
            logger.exception("unexpected transcription failure")
            self._error(500, "INTERNAL_ERROR", "Transcription failed unexpectedly")
            return
        self._send(200, result)


def make_server(host: str, port: int, **kwargs: Any) -> TranscriptionHTTPServer:
    return TranscriptionHTTPServer((host, port), **kwargs)


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    host = os.environ.get("AI_ENGINE_HOST", "127.0.0.1")
    port = int(os.environ.get("AI_ENGINE_PORT", "8000"))
    audio_root = os.environ.get("TRANSCRIPTION_AUDIO_ROOT")
    if not audio_root:
        logger.warning("TRANSCRIPTION_AUDIO_ROOT is not set: /transcribe will answer 503 until it is configured")
    token = os.environ.get("TRANSCRIBER_INTERNAL_TOKEN") or None
    if not token and host not in ("127.0.0.1", "localhost", "::1"):
        logger.warning("listening on %s without TRANSCRIBER_INTERNAL_TOKEN: anyone who can reach the port can transcribe", host)
    server = make_server(host, port, audio_root=audio_root, internal_token=token, config=TranscriptionConfig.from_env())
    logger.info("transcription service listening on %s:%s", host, port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
