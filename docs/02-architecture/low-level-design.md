# Low-Level Design

Implementation details remain to be agreed. Keep domain calculations in a testable service/module, validate requests at API boundaries, persist immutable assessment history, and derive final categories from versioned parameters. Avoid embedding raw numeric assessment fields into text embeddings by default; use structured metadata filters for criticality.
