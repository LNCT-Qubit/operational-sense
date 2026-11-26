# Changelog

## Unreleased
- Login: `POST /api/v1/auth/login` (bcrypt compare, `is_active` check, HS256 JWT via the existing `signJwtHs256`), migration `011_login_lookup.sql` (`login_org_id()` narrow SECURITY DEFINER lookup), and the web login form now calls the real API (token kept in memory only).
- Restructured the Asset Criticality Framework starter materials into the supplied `operational-sense/` repository layout.
- Added project documentation scaffolds and repository contribution/security templates.
- Preserved the original framework document and scoring workbook as source artifacts.
- Runtime services and workflows are scaffolds and must be configured and tested before production use.
