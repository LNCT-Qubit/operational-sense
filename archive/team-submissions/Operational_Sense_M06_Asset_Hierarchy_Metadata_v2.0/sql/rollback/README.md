# Rollback and recovery

No automatic down migration is supplied for shared or production databases.

For the disposable test database created specifically for this M06 candidate, the entire migration can be discarded by dropping and recreating that database after all test processes stop. This is destructive and must not be run against a shared or production database.

The integration test file `tests/postgres/verify_m06.sql` uses `BEGIN`/`ROLLBACK` so its temporary hierarchy records are not retained. The seed script itself is insert-only and idempotent; it does not delete rows or reverse existing review decisions.

If the migration partially fails, `--single-transaction` should roll back the migration as a unit. Verify the database before retrying. If a different migration runner is adopted, confirm its transaction behavior first.
