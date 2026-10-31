"""Security / configuration hygiene checks (static; no database). Not a security certification."""
import os
import re
import unittest

from tests.common import ROOT


def read(*p):
    with open(os.path.join(ROOT, *p), encoding="utf-8") as fh:
        return fh.read()


def walk():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in (".git", "__pycache__")]
        for f in files:
            yield os.path.join(d, f)


class Secrets(unittest.TestCase):
    def test_no_env_files_or_git_history_shipped(self):
        names = [os.path.relpath(p, ROOT) for p in walk()]
        self.assertEqual([n for n in names if os.path.basename(n).startswith(".env") and not n.endswith(".example")], [])
        self.assertFalse(os.path.exists(os.path.join(ROOT, ".git")))
        self.assertEqual([n for n in names if n.endswith(".DS_Store") or "__MACOSX" in n], [])

    def test_env_example_has_only_placeholders(self):
        for line in read(".env.example").splitlines():
            if line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if "PASSWORD" in k:
                self.assertTrue(v.startswith("CHANGE_ME"), line)

    def test_no_credential_literals_in_python(self):
        pat = re.compile(r"(password|passwd|secret|api[_-]?key)\s*=\s*['\"][^'\"]{4,}['\"]", re.I)
        for p in walk():
            if p.endswith(".py") and "/tests/" not in p:
                self.assertIsNone(pat.search(open(p, encoding="utf-8").read()), p)

    # ---- Fix 1 (Group 3 Final): no hard-coded credentials; password set from the environment ----
    TEXT_EXT = (".sql", ".sh", ".py", ".yml", ".yaml", ".md", ".txt", ".example", ".json", ".csv")

    def test_no_known_dev_password_anywhere(self):
        for p in walk():
            if p.endswith(self.TEXT_EXT) or os.path.basename(p) == ".env.example":
                if os.path.abspath(p) == os.path.abspath(__file__):
                    continue
                self.assertNotIn("opsense_app_dev", open(p, encoding="utf-8", errors="ignore").read(), p)

    def test_sql_has_no_password_literal(self):
        pat = re.compile(r"PASSWORD\s+'[^']+'", re.I)
        for p in walk():
            if p.endswith(".sql"):
                self.assertIsNone(pat.search(open(p, encoding="utf-8", errors="ignore").read()), p)

    def test_scripts_have_no_password_literal(self):
        pat = re.compile(r"(PASSWORD|PGPASSWORD)\s*=\s*['\"]?(?!\$|CHANGE_ME)[A-Za-z0-9_!@#%^&*-]{4,}", re.I)
        for p in walk():
            if p.endswith(".sh"):
                self.assertIsNone(pat.search(open(p, encoding="utf-8").read()), p)

    def test_migration_007_creates_role_without_password_and_least_privilege(self):
        sql = read("database", "migrations", "007_row_level_security.sql")
        self.assertIn("CREATE ROLE opsense_app LOGIN NOSUPERUSER NOBYPASSRLS", sql)
        self.assertNotRegex(sql, r"(?i)CREATE ROLE[^;]*PASSWORD")
        self.assertIn("NO password", sql)

    def test_password_script_reads_env_and_is_not_on_command_line(self):
        s = read("database", "scripts", "set_app_password.sh")
        self.assertIn("OPSENSE_APP_PASSWORD", s)
        self.assertIn("\\getenv", s)           # psql reads it from the container environment
        self.assertIn("%L", s)                  # quoted literal
        self.assertIn("CHANGE_ME", s)           # refuses the placeholder
        self.assertNotRegex(s, r"-c\s+[\"'][^\"']*PASSWORD[^\"']*\$")  # never interpolated into -c text
        self.assertIn("NOSUPERUSER NOBYPASSRLS", s)

    def test_poc_runner_applies_password_script_after_migrations(self):
        r = read("poc", "run_poc.sh")
        self.assertLess(r.index("migrate.sh"), r.index("set_app_password.sh"))
        self.assertIn("verify_rls.sql", r)
        self.assertFalse(os.path.exists(os.path.join(ROOT, "poc", "set_app_password.sql")))

    def test_env_example_password_placeholders_only(self):
        vals = {}
        for line in read(".env.example").splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1); vals[k] = v
        self.assertTrue(vals["POSTGRES_PASSWORD"].startswith("CHANGE_ME"))
        self.assertTrue(vals["OPSENSE_APP_PASSWORD"].startswith("CHANGE_ME"))

    def test_compose_binds_loopback_only(self):
        c = read("database", "docker-compose.yml")
        self.assertIn("127.0.0.1:", c); self.assertNotRegex(c, r'-\s*"5432:5432"')


class RowLevelSecurity(unittest.TestCase):
    sql = read("database", "migrations", "007_row_level_security.sql")

    def test_app_role_is_not_superuser_or_bypassrls(self):
        self.assertIn("NOSUPERUSER NOBYPASSRLS", self.sql)
        self.assertIn("ALTER ROLE opsense_app NOSUPERUSER NOBYPASSRLS", self.sql)

    def test_force_rls_on_all_tenant_tables(self):
        self.assertIn("FORCE ROW LEVEL SECURITY", self.sql)
        for t in ("operational_case", "historical_case", "troubleshooting_step", "case_failure_mapping", "audit_log", "organization"):
            self.assertIn(t, self.sql)

    def test_insert_has_with_check_and_update_has_using_and_with_check(self):
        for m in re.finditer(r"CREATE POLICY tenant_insert ON [^']*?(?=')", self.sql):
            self.assertIn("WITH CHECK", m.group(0))
        for m in re.finditer(r"CREATE POLICY tenant_update ON [^']*?(?=')", self.sql):
            self.assertIn("USING", m.group(0)); self.assertIn("WITH CHECK", m.group(0))

    def test_no_delete_grant_or_policy_and_fail_closed_context(self):
        self.assertNotRegex(self.sql, r"GRANT[^;]*DELETE")
        self.assertNotIn("FOR DELETE", self.sql)
        self.assertIn("NULLIF(current_setting('app.current_org_id', true), '')", self.sql)

    def test_every_tenant_write_policy_has_expected_clauses_per_table(self):
        """Parse the generated policy templates: INSERT -> WITH CHECK; UPDATE -> USING + WITH CHECK; SELECT -> USING."""
        self.assertRegex(self.sql, r"tenant_select ON %I FOR SELECT USING \(%s\)")
        self.assertRegex(self.sql, r"tenant_insert ON %I FOR INSERT WITH CHECK \(%s\)")
        self.assertRegex(self.sql, r"tenant_update ON %I FOR UPDATE USING \(%s\) WITH CHECK \(%s\)")
        # child tables: all three clauses reference the (RLS-filtered) parent case
        self.assertEqual(self.sql.count("FOR INSERT WITH CHECK (EXISTS"), 1)
        self.assertEqual(self.sql.count("FOR UPDATE USING (EXISTS"), 1)
        self.assertIn("WITH CHECK (EXISTS (SELECT 1 FROM operational_case c WHERE c.case_id = %I.case_id))", self.sql)

    def test_live_rls_script_covers_cross_tenant_select_insert_update(self):
        v = read("database", "scripts", "verify_rls.sql")
        for needle in ("rolsuper", "rolbypassrls", "with_check IS NULL", "qual IS NULL OR with_check IS NULL",
                       "SELECT Org B historical_case", "INSERT historical_case for Org B", "UPDATE Org B historical_case",
                       "moving own historical_case row", "empty tenant context", "troubleshooting_step", "ROLLBACK"):
            self.assertIn(needle, v)
        t = read("database", "scripts", "test_schema.sql")   # Group 2 baseline test for operational_case
        for n in ("T1 read Org B", "T3 insert with other organization", "T4 update Org B", "T5 moving a row"):
            self.assertIn(n, t)

    def test_python_sets_tenant_context_transaction_local(self):
        self.assertIn("set_config('app.current_org_id', %s, true)", read("retrieval", "db.py"))


class SqlSafety(unittest.TestCase):
    def test_repository_binds_all_user_values(self):
        repo = read("retrieval", "repository.py")
        for needle in ("%(cls)s", "%(sub)s", "%(mdl)s", "%(syn)s", "%(tax)s", "%(fm)s", "%(q)s", "%(limit)s"):
            self.assertIn(needle, repo)
        # no value interpolation of user-controlled arguments into SQL text
        for bad in ("equipment_class_id}", "taxonomy_code}", "failure_mode_id}", "query_literal}"):
            self.assertNotIn(bad, repo)

    def test_only_constant_fragments_are_formatted_into_sql(self):
        el = read("retrieval", "eligibility.py")
        self.assertIn("constants only, never user input", el)

    def test_poc_similarity_sql_is_consistent(self):
        s = read("poc", "similarity_search.sql")
        for needle in ("<=>", "JOIN operational_case", "app.current_org_id", "LIMIT 3", "demo_only_until_expert_review", "h.status = c.case_status"):
            self.assertIn(needle, s)

    def test_scripts_syntax(self):
        import subprocess
        for f in ("poc/run_poc.sh", "database/scripts/migrate.sh", "database/scripts/seed.sh", "database/scripts/load_all_m09.sh", "database/scripts/set_app_password.sh"):
            r = subprocess.run(["bash", "-n", os.path.join(ROOT, f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, f + r.stderr)


class Reproducibility(unittest.TestCase):
    def test_yaml_matches_code_defaults(self):
        y = read("embedding_strategy", "embedding_config.yaml")
        from retrieval import embedding_config as ec
        from retrieval.text_builder import TEXT_BUILDER_VERSION, EMBEDDING_FIELDS
        self.assertIn(ec.DEFAULT_MODEL, y); self.assertIn(f"dimension: {ec.DEFAULT_DIMENSION}", y)
        self.assertIn(TEXT_BUILDER_VERSION, y)
        for col, _ in EMBEDDING_FIELDS:
            self.assertIn(col, y)

    def test_requirements_are_bounded(self):
        for line in read("requirements.txt").splitlines():
            if line and not line.startswith("#"):
                self.assertIn("<", line, line)


if __name__ == "__main__":
    unittest.main()
