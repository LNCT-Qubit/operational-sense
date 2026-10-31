-- 005_seed_demo_organization.sql   (M09 addition)
-- The case, asset and step imports all use organization b2a7dce7-... but NO script in the
-- original package created that row, so a fresh database failed on the organization_id foreign key.
-- Synthetic/demo tenant only. Safe to re-run: an existing row (same id or same name) is left unchanged.
-- seed.sh runs seed_data/*.sql in name order, so this file runs before 010 and 020.

BEGIN;

INSERT INTO organization (organization_id, name)
VALUES ('b2a7dce7-b449-4381-ba3b-b520f2c88c2e', 'Operational Sense Demo Organisation (synthetic)')
ON CONFLICT DO NOTHING;

COMMIT;
