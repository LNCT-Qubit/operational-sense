# AI Engine

Scaffold for ingestion, preprocessing, taxonomy mapping, embeddings, graph/vector/hybrid retrieval, reranking, evidence packaging, answer generation, and evaluation. Implementations and model/provider choices are intentionally not assumed.

## Transcription HTTP service (US-05 wrapper)

The Node backend calls Whisper through `app/transcription/server.py` (Python standard library only, no extra dependency):

```bash
cd services/ai-engine
TRANSCRIPTION_AUDIO_ROOT=/abs/path/to/uploads python -m app.transcription.server   # listens on 127.0.0.1:8000
curl http://127.0.0.1:8000/health
```

- `POST /transcribe` takes `{audio_path, recording_id, transcription_id, attempt_number}` and returns the `TranscriptionResult` JSON.
  `COMPLETED`, `EMPTY` and `FAILED` are all HTTP 200 (domain outcomes); 4xx/5xx mean the wrapper itself refused or failed.
- Only files inside `TRANSCRIPTION_AUDIO_ROOT` are read (`..` and symlinks are resolved first, otherwise `403`).
- Set `TRANSCRIBER_INTERNAL_TOKEN` (same value as the backend) to require an `X-Internal-Token` header. Keep the default
  `127.0.0.1` bind unless a network boundary protects the port.
- One transcription runs at a time (single CPU-bound model). Tests: `python -m unittest tests.transcription.test_server -v`.

