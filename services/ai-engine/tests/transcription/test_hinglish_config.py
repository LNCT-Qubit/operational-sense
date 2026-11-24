"""
US-05 – Hinglish profile and extended configuration tests.

No model is loaded; these tests only exercise configuration logic.
"""
from __future__ import annotations

import os

import pytest

from app.transcription.config import (
    HINGLISH_MODELS,
    TranscriptionConfig,
    is_valid_model_identifier,
)


def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in list(os.environ):
        if key.startswith("TRANSCRIPTION_"):
            monkeypatch.delenv(key, raising=False)


class TestModelIdentifier:
    def test_official_sizes_valid(self) -> None:
        for name in ("tiny", "base", "small", "medium", "large-v2", "large-v3"):
            assert is_valid_model_identifier(name)

    def test_hf_repo_id_valid(self) -> None:
        assert is_valid_model_identifier("owner/some-model_v1.2")

    def test_existing_directory_valid(self, tmp_path) -> None:
        assert is_valid_model_identifier(str(tmp_path))

    @pytest.mark.parametrize("bad", ["", "huge", "no such/ dir/x", "a/b/c", "../x"])
    def test_invalid_identifiers(self, bad: str) -> None:
        assert not is_valid_model_identifier(bad)

    def test_config_rejects_unknown_model(self) -> None:
        with pytest.raises(ValueError, match="Unsupported model"):
            TranscriptionConfig(model_name="huge")

    def test_config_accepts_repo_id(self) -> None:
        cfg = TranscriptionConfig(model_name="owner/model")
        assert cfg.model_name == "owner/model"


class TestDefaultsUnchanged:
    def test_default_config_is_still_english_tiny(self) -> None:
        cfg = TranscriptionConfig()
        assert cfg.model_name == "tiny"
        assert cfg.language is None
        assert cfg.profile == "default"
        assert cfg.temperature is None
        assert cfg.initial_prompt is None
        assert cfg.model_dir is None
        assert cfg.local_files_only is False


class TestHinglishProfile:
    def test_hinglish_defaults(self) -> None:
        cfg = TranscriptionConfig.hinglish()
        assert cfg.profile == "hinglish"
        assert cfg.model_name == HINGLISH_MODELS["accurate"]
        assert cfg.language == "en"  # Roman-script Hinglish output token
        assert cfg.temperature == 0.0
        assert cfg.device == "cpu"
        assert cfg.compute_type == "int8"
        assert cfg.vad_filter is True

    def test_fast_quality_uses_small_model(self) -> None:
        cfg = TranscriptionConfig.hinglish("fast")
        assert cfg.model_name == HINGLISH_MODELS["fast"]

    def test_overrides_win(self) -> None:
        cfg = TranscriptionConfig.hinglish(beam_size=1, initial_prompt="pump bearing")
        assert cfg.beam_size == 1
        assert cfg.initial_prompt == "pump bearing"

    def test_unknown_quality_rejected(self) -> None:
        with pytest.raises(ValueError, match="Unknown Hinglish quality"):
            TranscriptionConfig.hinglish("ultra")

    def test_unknown_profile_rejected(self) -> None:
        with pytest.raises(ValueError, match="Unsupported profile"):
            TranscriptionConfig(profile="klingon")

    def test_negative_temperature_rejected(self) -> None:
        with pytest.raises(ValueError, match="temperature"):
            TranscriptionConfig(temperature=-0.1)


class TestFromEnv:
    def test_default_profile_from_env_unchanged(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        cfg = TranscriptionConfig.from_env()
        assert cfg.model_name == "tiny"
        assert cfg.language is None
        assert cfg.profile == "default"

    def test_hinglish_profile_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_PROFILE", "hinglish")
        cfg = TranscriptionConfig.from_env()
        assert cfg.profile == "hinglish"
        assert cfg.model_name == HINGLISH_MODELS["accurate"]
        assert cfg.language == "en"
        assert cfg.temperature == 0.0

    def test_hinglish_fast_quality_from_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_PROFILE", "hinglish")
        monkeypatch.setenv("TRANSCRIPTION_HINGLISH_QUALITY", "fast")
        cfg = TranscriptionConfig.from_env()
        assert cfg.model_name == HINGLISH_MODELS["fast"]

    def test_explicit_env_overrides_profile(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_PROFILE", "hinglish")
        monkeypatch.setenv("TRANSCRIPTION_MODEL_NAME", "small")
        monkeypatch.setenv("TRANSCRIPTION_LANGUAGE", "hi")
        monkeypatch.setenv("TRANSCRIPTION_TEMPERATURE", "0.2")
        cfg = TranscriptionConfig.from_env()
        assert cfg.model_name == "small"
        assert cfg.language == "hi"
        assert cfg.temperature == 0.2

    def test_empty_language_means_auto_detect(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_PROFILE", "hinglish")
        monkeypatch.setenv("TRANSCRIPTION_LANGUAGE", "")
        assert TranscriptionConfig.from_env().language is None

    def test_cache_and_offline_settings(self, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_MODEL_DIR", str(tmp_path))
        monkeypatch.setenv("TRANSCRIPTION_LOCAL_FILES_ONLY", "true")
        monkeypatch.setenv("TRANSCRIPTION_INITIAL_PROMPT", "pump, bearing, motor")
        cfg = TranscriptionConfig.from_env()
        assert cfg.model_dir == str(tmp_path)
        assert cfg.local_files_only is True
        assert cfg.initial_prompt == "pump, bearing, motor"

    def test_bad_profile_in_env_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _clean_env(monkeypatch)
        monkeypatch.setenv("TRANSCRIPTION_PROFILE", "klingon")
        with pytest.raises(ValueError, match="Unsupported profile"):
            TranscriptionConfig.from_env()
