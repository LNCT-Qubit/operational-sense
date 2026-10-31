import os
import unittest
from unittest import mock

from retrieval.embedding_config import ConfigError, load_embedding_settings

_KEYS = ["OPSENSE_EMBEDDING_PROVIDER", "OPSENSE_EMBEDDING_MODEL", "OPSENSE_EMBEDDING_DIM",
         "OPSENSE_EMBEDDING_QUERY_PREFIX", "OPSENSE_EMBEDDING_DOCUMENT_PREFIX",
         "OPSENSE_EMBEDDING_BATCH_SIZE", "OPSENSE_MAX_QUERY_CHARS", "OPSENSE_MIN_SIMILARITY"]


def clean_env(**extra):
    env = {k: v for k, v in os.environ.items() if k not in _KEYS}
    env.update(extra)
    return mock.patch.dict(os.environ, env, clear=True)


class EmbeddingConfigTests(unittest.TestCase):
    def test_defaults_match_database_placeholder_dimension(self):
        with clean_env():
            s = load_embedding_settings(load_env_file=False)
        self.assertEqual(s.dimension, 384)
        self.assertEqual(s.model, "intfloat/multilingual-e5-small")
        self.assertIsNone(s.min_similarity)

    def test_environment_overrides(self):
        with clean_env(OPSENSE_EMBEDDING_MODEL="other/model", OPSENSE_EMBEDDING_DIM="768"):
            s = load_embedding_settings(load_env_file=False)
        self.assertEqual((s.model, s.dimension), ("other/model", 768))

    def test_empty_prefix_is_allowed(self):
        with clean_env(OPSENSE_EMBEDDING_QUERY_PREFIX=""):
            self.assertEqual(load_embedding_settings(load_env_file=False).query_prefix, "")

    def test_bad_values_rejected(self):
        for name, value in (("OPSENSE_EMBEDDING_DIM", "abc"), ("OPSENSE_EMBEDDING_DIM", "0"),
                            ("OPSENSE_MIN_SIMILARITY", "high"), ("OPSENSE_MIN_SIMILARITY", "2")):
            with clean_env(**{name: value}), self.assertRaises(ConfigError):
                load_embedding_settings(load_env_file=False)


if __name__ == "__main__":
    unittest.main()
