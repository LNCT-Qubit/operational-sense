"""
US-05 – WhisperProvider tests with a fake ``faster_whisper`` module.

These tests verify *how* the provider calls faster-whisper (model name,
cache/offline options, language, temperature, prompt).  They do NOT run real
Whisper inference.
"""
from __future__ import annotations

import sys
import types
from typing import Any

import pytest

import app.transcription.whisper_provider as wp
from app.transcription.config import TranscriptionConfig
from app.transcription.exceptions import ModelInitializationError
from app.transcription.whisper_provider import WhisperProvider


class _Recorder:
    """Collects constructor / transcribe calls made by the provider."""

    def __init__(self) -> None:
        self.init_calls: list[tuple[tuple, dict]] = []
        self.transcribe_calls: list[tuple[tuple, dict]] = []
        self.fail_on_init = False


@pytest.fixture
def fake_fw(monkeypatch: pytest.MonkeyPatch) -> _Recorder:
    rec = _Recorder()

    class FakeWhisperModel:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            if rec.fail_on_init:
                raise RuntimeError("boom (contains /secret/path)")
            rec.init_calls.append((args, kwargs))

        def transcribe(self, audio: Any, **kwargs: Any):
            rec.transcribe_calls.append(((audio,), kwargs))
            seg = types.SimpleNamespace(start=0.0, end=1.0, text=" ok")
            info = types.SimpleNamespace(language="en", language_probability=0.9)
            return iter([seg]), info

    module = types.ModuleType("faster_whisper")
    module.WhisperModel = FakeWhisperModel  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "faster_whisper", module)
    wp._model_cache.clear()
    yield rec
    wp._model_cache.clear()


class TestModelLoading:
    def test_default_config_loads_tiny_without_extra_kwargs(self, fake_fw: _Recorder) -> None:
        WhisperProvider(TranscriptionConfig())._load_model()
        args, kwargs = fake_fw.init_calls[0]
        assert args == ("tiny",)
        assert kwargs == {"device": "cpu", "compute_type": "int8"}

    def test_hinglish_config_loads_hf_model(self, fake_fw: _Recorder) -> None:
        cfg = TranscriptionConfig.hinglish()
        WhisperProvider(cfg)._load_model()
        args, kwargs = fake_fw.init_calls[0]
        assert args == (cfg.model_name,)
        assert "/" in args[0]
        assert kwargs["device"] == "cpu" and kwargs["compute_type"] == "int8"

    def test_model_dir_and_offline_are_forwarded(self, fake_fw: _Recorder, tmp_path) -> None:
        cfg = TranscriptionConfig(model_dir=str(tmp_path), local_files_only=True)
        WhisperProvider(cfg)._load_model()
        _, kwargs = fake_fw.init_calls[0]
        assert kwargs["download_root"] == str(tmp_path)
        assert kwargs["local_files_only"] is True

    def test_model_is_cached_per_config(self, fake_fw: _Recorder) -> None:
        cfg = TranscriptionConfig()
        WhisperProvider(cfg)._load_model()
        WhisperProvider(cfg)._load_model()
        assert len(fake_fw.init_calls) == 1

    def test_different_model_dir_is_a_different_cache_entry(
        self, fake_fw: _Recorder, tmp_path
    ) -> None:
        WhisperProvider(TranscriptionConfig())._load_model()
        WhisperProvider(TranscriptionConfig(model_dir=str(tmp_path)))._load_model()
        assert len(fake_fw.init_calls) == 2

    def test_load_failure_is_typed_and_does_not_leak_details(self, fake_fw: _Recorder) -> None:
        fake_fw.fail_on_init = True
        with pytest.raises(ModelInitializationError) as exc_info:
            WhisperProvider(TranscriptionConfig())._load_model()
        assert "secret" not in str(exc_info.value)


class TestInferenceArguments:
    def test_default_inference_arguments(self, fake_fw: _Recorder) -> None:
        provider = WhisperProvider(TranscriptionConfig())
        provider.transcribe("does-not-exist.wav")
        _, kwargs = fake_fw.transcribe_calls[0]
        assert kwargs["language"] is None
        assert kwargs["beam_size"] == 5
        assert "temperature" not in kwargs
        assert "initial_prompt" not in kwargs

    def test_hinglish_inference_arguments(self, fake_fw: _Recorder) -> None:
        provider = WhisperProvider(TranscriptionConfig.hinglish())
        provider.transcribe("does-not-exist.wav")
        _, kwargs = fake_fw.transcribe_calls[0]
        assert kwargs["language"] == "en"
        assert kwargs["temperature"] == 0.0
        assert kwargs["vad_filter"] is True

    def test_initial_prompt_is_forwarded(self, fake_fw: _Recorder) -> None:
        provider = WhisperProvider(TranscriptionConfig(initial_prompt="pump bearing"))
        provider.transcribe("does-not-exist.wav")
        _, kwargs = fake_fw.transcribe_calls[0]
        assert kwargs["initial_prompt"] == "pump bearing"

    def test_per_call_language_overrides_config(self, fake_fw: _Recorder) -> None:
        provider = WhisperProvider(TranscriptionConfig.hinglish())
        provider.transcribe("does-not-exist.wav", language="hi")
        _, kwargs = fake_fw.transcribe_calls[0]
        assert kwargs["language"] == "hi"
