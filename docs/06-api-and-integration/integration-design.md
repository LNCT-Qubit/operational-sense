# Integration Design

Integrations should use stable IDs, versioned schemas, explicit authentication, retries for transient failures, idempotency where writes may be repeated, and provenance metadata. CSV import should use the same field names and validation rules as the API. External system connectors and production credentials are not configured in this starter.
