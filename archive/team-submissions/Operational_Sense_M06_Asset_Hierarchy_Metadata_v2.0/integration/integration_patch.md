# Integration patch notes

This package is an M06 candidate and review handoff, not a patch applied to the live repository.

## Migration/seed order

1. Inspect the actual repository and M05 schema.
2. Resolve stack and Common Data Model decisions.
3. Reconcile the candidate migration with the confirmed migration runner.
4. Apply the migration to a clean disposable PostgreSQL database.
5. Run `sql/seed_data/seed_m06_reference_data.sql` twice.
6. Run `sql/validation/03_seed_data_integrity.sql`.
7. Run `tests/postgres/verify_m06.sql`.
8. Run existing project CI and capture actual output.

The candidate migration must not be applied if M05 already owns `equipment_class` or `asset_node`; its preflight intentionally raises an exception. Integrate by editing the existing schema/migration instead of creating duplicate definitions.

## Git handoff

Suggested branch: `feature/m06-asset-hierarchy-metadata`

Suggested commit: `feat(m06): add asset hierarchy and metadata candidate`

From a fresh local clone, first inspect the working tree:

```bash
git status --short --branch
git ls-files
git diff --check
```

Keep the package in a dedicated `m06/` directory for review if the project owner has not confirmed a migration destination. Stage only the confirmed M06 folder:

```bash
git switch -c feature/m06-asset-hierarchy-metadata
git add m06/
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "feat(m06): add asset hierarchy and metadata candidate"
git push -u origin feature/m06-asset-hierarchy-metadata
```

These commands are proposed only. No branch, commit, push or pull request was created in this environment. If files are moved to approved repository paths instead of `m06/`, stage only those exact paths after reviewing `git status`.
