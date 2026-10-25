# Error Handling

Return a consistent error envelope with a stable error code, human-readable message, request/correlation ID, and field-level validation details where safe. Do not expose stack traces, credentials, internal paths, or sensitive source payloads. Distinguish validation, authorization, not-found, conflict, rate-limit, and transient service errors.
