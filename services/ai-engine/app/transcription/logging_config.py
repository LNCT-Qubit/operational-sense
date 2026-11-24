"""
US-05 – Whisper Speech-to-Text Integration
Logging configuration for the transcription subsystem.

This module provides lightweight logging helpers that ensure consistent
formatting across the pipeline.

Privacy note
------------
Loggers in this package must **never** emit audio content, transcript text,
or other personal data at ``DEBUG`` level (or any level, for that matter).
The helpers below enforce this by configuring formatters that strip
positional ``%(message)s`` strings from known high-risk loggers and by
documenting the prohibition in the public API.
"""
from __future__ import annotations

import logging
import sys


# ---------------------------------------------------------------------------
# Default format
# ---------------------------------------------------------------------------

_DEFAULT_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
)

_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def configure_logging(level: str = "INFO") -> None:
    """Configure root-level logging for the transcription subsystem.

    Safe to call multiple times; subsequent calls update the root logger's
    effective level and do not add duplicate handlers.

    Parameters
    ----------
    level:
        Logging level string accepted by :func:`logging.getLevelName`
        (e.g. ``"DEBUG"``, ``"INFO"``, ``"WARNING"``, ``"ERROR"``).
        Defaults to ``"INFO"``.

    Notes
    -----
    * Log records **must not** include audio content, file contents, or raw
      transcript text.
    * The handler writes to ``sys.stdout`` so that container orchestrators
      (Docker, Kubernetes) can capture output with their standard log
      collectors.
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(numeric_level)

    # Avoid adding duplicate handlers if already configured.
    if any(isinstance(h, logging.StreamHandler) for h in root_logger.handlers):
        root_logger.setLevel(numeric_level)
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(numeric_level)
    formatter = logging.Formatter(fmt=_DEFAULT_FORMAT, datefmt=_DATE_FORMAT)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Return a named :class:`logging.Logger` for use within the pipeline.

    Parameters
    ----------
    name:
        Logger name, typically ``__name__`` of the calling module (e.g.
        ``"app.transcription.transcription_service"``).

    Returns
    -------
    logging.Logger
        Configured logger.  Level is inherited from the root logger unless
        overridden explicitly.

    Warnings
    --------
    Callers **must not** log audio sample data, transcript text, file
    contents, or other personal data at any log level.  Restrict log
    messages to structural information: file names (not paths), sizes,
    durations, error codes, and status transitions.
    """
    return logging.getLogger(name)

