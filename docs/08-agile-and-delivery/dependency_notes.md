# Dependency notes

## Required before database integration

- PostgreSQL server and `psql` client.
- Disposable database name containing `test` for the supplied test runner.
- Approved M05 schema or explicit approval to use the candidate schema.
- Confirmation of migration framework and transaction behavior.
- Resolution of repository README's Spring Boot stack vs task prompt's Node.js + Express.
- Group 1 approval of hierarchy levels and subsystem/component mapping.
- Common Data Model and M04 formal approval.

## pgvector

M06 does not modify or require the `vector` extension. Verify the project database's pgvector installation separately when PostgreSQL access is available.

## Environment checks actually observed

- Python: 3.13.5
- Node.js: v22.16.0 (not used for an application migration runner due stack discrepancy)
- Git: 2.47.3
- Graphviz `dot`: available
- `psql`: unavailable
- Docker CLI: unavailable
- Direct Git remote: failed `Could not resolve host: github.com`

These are authoring-environment observations, not project runtime requirements.
