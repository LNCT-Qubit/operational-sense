"""Tests for app.transcription.server (HTTP wrapper). Whisper is replaced by a fake; only stdlib is needed."""
from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from app.transcription.server import make_server


def _fake_result(**kw):
    base = {
        "transcription_id": kw.get("transcription_id") or "t-1", "recording_id": kw.get("recording_id"),
        "attempt_number": kw.get("attempt_number", 1), "status": "COMPLETED", "transcript": "pump 3 is leaking",
        "detected_language": "en", "language_probability": 0.9, "segments": [], "processing_duration_seconds": 0.1,
        "error_code": None, "error_message": None, "model_name": "fake", "created_at": "2026-01-01T00:00:00Z",
    }
    return base


class ServerTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name).resolve()
        self.calls: list[dict] = []

        def fake(**kw):
            self.calls.append(kw)
            return _fake_result(**kw)

        self.fake = fake
        self._servers: list = []

    def tearDown(self):
        for s in self._servers:
            s.shutdown()
            s.server_close()
        self._tmp.cleanup()

    def start(self, **over):
        kw = {"audio_root": str(self.root), "internal_token": None, "transcribe": self.fake}
        kw.update(over)
        srv = make_server("127.0.0.1", 0, **kw)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self._servers.append(srv)
        return f"http://127.0.0.1:{srv.server_address[1]}"

    @staticmethod
    def post(url, body, headers=None, raw=None):
        data = raw if raw is not None else json.dumps(body).encode()
        req = urllib.request.Request(url + "/transcribe", data=data, method="POST",
                                     headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def audio(self, name="a.wav"):
        p = self.root / name
        p.write_bytes(b"RIFF")
        return str(p)

    def test_health_does_not_need_a_model(self):
        with urllib.request.urlopen(self.start() + "/health", timeout=10) as r:
            self.assertEqual(json.loads(r.read()), {"status": "ok"})

    def test_transcribe_ok_passes_ids_and_attempt(self):
        url = self.start()
        status, body = self.post(url, {"audio_path": self.audio(), "recording_id": "r1", "transcription_id": "t9", "attempt_number": 2})
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "COMPLETED")
        self.assertEqual(self.calls[0]["recording_id"], "r1")
        self.assertEqual(self.calls[0]["transcription_id"], "t9")
        self.assertEqual(self.calls[0]["attempt_number"], 2)

    def test_path_outside_root_is_403_and_engine_not_called(self):
        status, body = self.post(self.start(), {"audio_path": "/etc/passwd"})
        self.assertEqual(status, 403)
        self.assertEqual(body["error"]["code"], "PATH_NOT_ALLOWED")
        self.assertEqual(self.calls, [])

    def test_dotdot_traversal_is_403(self):
        status, _ = self.post(self.start(), {"audio_path": str(self.root / ".." / "x.wav")})
        self.assertEqual(status, 403)
        self.assertEqual(self.calls, [])

    def test_symlink_escaping_root_is_403(self):
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "secret.wav"
            target.write_bytes(b"RIFF")
            link = self.root / "link.wav"
            link.symlink_to(target)
            status, _ = self.post(self.start(), {"audio_path": str(link)})
        self.assertEqual(status, 403)
        self.assertEqual(self.calls, [])

    def test_missing_file_inside_root_reaches_engine(self):          # the engine (not the wrapper) reports FILE_NOT_FOUND
        status, _ = self.post(self.start(), {"audio_path": str(self.root / "gone.wav")})
        self.assertEqual(status, 200)
        self.assertEqual(len(self.calls), 1)

    def test_validation_errors(self):
        url = self.start()
        self.assertEqual(self.post(url, None, raw=b"{not json")[0], 400)
        self.assertEqual(self.post(url, ["x"])[0], 400)
        self.assertEqual(self.post(url, {})[0], 400)
        self.assertEqual(self.post(url, {"audio_path": ""})[0], 400)
        self.assertEqual(self.post(url, {"audio_path": self.audio(), "attempt_number": 0})[0], 400)
        self.assertEqual(self.post(url, {"audio_path": self.audio(), "attempt_number": True})[0], 400)
        self.assertEqual(self.post(url, {"audio_path": self.audio(), "recording_id": 5})[0], 400)
        self.assertEqual(self.calls, [])

    def test_body_too_large_is_413(self):
        status, _ = self.post(self.start(), {"audio_path": "x" * 20000})
        self.assertEqual(status, 413)

    def test_internal_token_enforced(self):
        url = self.start(internal_token="s3cret")
        body = {"audio_path": self.audio()}
        self.assertEqual(self.post(url, body)[0], 401)
        self.assertEqual(self.post(url, body, {"X-Internal-Token": "wrong"})[0], 401)
        self.assertEqual(self.post(url, body, {"X-Internal-Token": "s3cret"})[0], 200)

    def test_unconfigured_root_is_503(self):
        status, body = self.post(self.start(audio_root=None), {"audio_path": self.audio()})
        self.assertEqual(status, 503)
        self.assertEqual(body["error"]["code"], "AUDIO_ROOT_NOT_CONFIGURED")

    def test_engine_exception_becomes_generic_500_without_details(self):
        def boom(**kw):
            raise RuntimeError("/secret/path exploded")
        status, body = self.post(self.start(transcribe=boom), {"audio_path": self.audio()})
        self.assertEqual(status, 500)
        self.assertNotIn("secret", json.dumps(body))

    def test_unknown_route_404(self):
        url = self.start()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(url + "/nope", timeout=10)
        self.assertEqual(cm.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
