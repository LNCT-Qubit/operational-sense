"""Regression tests: database/scripts/local_pg.sh must never hide a SQL failure.

Offline tests put a FAKE `psql` first on PATH (no database needed). They prove the shell contract:
failing file -> non-zero exit, later steps not run, FAIL/ERROR/no-PASS output -> non-zero, success path -> 0.
A live test (skipped unless OPSENSE_LIVE_PG=1 and PG* env point at a DISPOSABLE database) runs the REAL psql with a
deliberately failing SQL migration. Offline tests are static/mock-level evidence only - they do not exercise PostgreSQL.
"""
import os, shutil, stat, subprocess, tempfile, unittest, shutil as _sh
from tests.common import PROJECT

SCRIPT = os.path.join(PROJECT, "scripts", "local_pg.sh")
FAKE = r'''#!/usr/bin/env bash
# fake psql: logs the -f file, fails/behaves per env
f=""; while [ $# -gt 0 ]; do [ "$1" = "-f" ] && { f="$2"; shift; }; shift; done
if [ -z "$f" ]; then cat >/dev/null; echo "$(printf 'stdin')" >>"$FAKE_LOG"
  [ "${FAKE_FAIL_ON:-}" = "stdin" ] && { echo "psql: error: boom" >&2; exit 3; }
  echo " opsense_app | f | f | t"; exit 0; fi
b="$(basename "$f")"; echo "$b" >>"$FAKE_LOG"
case "$b" in *"${FAKE_FAIL_ON:-@@none@@}"*) echo "psql:$f:1: ERROR:  deliberate failure"; echo "NOTICE: noise"; exit 3;; esac
case "$b" in
  m09_030_validate_live.sql|test_schema.sql|verify_rls.sql)
    case "${FAKE_VERIFY:-pass}" in
      pass) echo "NOTICE:  PASS X1 ok";;
      fail) echo "NOTICE:  PASS X1 ok"; echo "NOTICE:  FAIL X2 broken";;
      nopass) echo "nothing";;
      errexit0) echo "NOTICE:  PASS X1 ok"; echo "psql:$f:9: ERROR:  hidden";;
    esac;;
  *) echo "NOTICE: applied";;
esac
exit 0
'''

class FakePsqlBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bin = os.path.join(self.tmp, "bin"); os.makedirs(self.bin)
        p = os.path.join(self.bin, "psql")
        with open(p, "w") as fh: fh.write(FAKE)
        os.chmod(p, os.stat(p).st_mode | stat.S_IEXEC)
        self.log = os.path.join(self.tmp, "calls.log")
        open(self.log, "w").close()
    def tearDown(self): shutil.rmtree(self.tmp, ignore_errors=True)
    def run_step(self, step, **env):
        e = dict(os.environ, PATH=self.bin + os.pathsep + os.environ["PATH"], PGDATABASE="x", FAKE_LOG=self.log,
                 OPSENSE_APP_PASSWORD="a-long-enough-password-1")
        e.update(env)
        r = subprocess.run(["bash", SCRIPT, step], capture_output=True, text=True, env=e)
        calls = open(self.log).read().split()
        return r, calls

class TestFailFastOffline(FakePsqlBase):
    def test_success_path_exit_zero_and_runs_everything(self):
        r, calls = self.run_step("all")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(calls[:8], sorted(os.listdir(os.path.join(PROJECT, "migrations")))[:8])
        self.assertIn("verify_rls.sql", calls)
        self.assertIn("m09_040_apply_curation.sql", calls)
        self.assertIn("OK", r.stdout)

    def test_failing_migration_stops_subsequent_steps(self):
        r, calls = self.run_step("all", FAKE_FAIL_ON="003_reference")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(calls, ["001_extensions.sql", "002_taxonomy_tables.sql", "003_reference_tables.sql"])
        self.assertIn("deliberate failure", r.stdout + r.stderr)       # readable log kept
        self.assertNotIn("NOTICE: noise", r.stdout)                    # NOTICE filtered from display only
        self.assertNotIn("stdin", calls)                               # password step never ran
        self.assertFalse(any(c.startswith("m09_") for c in calls))     # seed/verify never ran

    def test_failing_seed_stops_later_seeds_and_verify(self):
        r, calls = self.run_step("seed", FAKE_FAIL_ON="step4_01_import_sources")
        self.assertNotEqual(r.returncode, 0)
        self.assertEqual(calls[-1], "step4_01_import_sources.sql")
        self.assertNotIn("m09_040_apply_curation.sql", calls)

    def test_failing_password_step_is_fatal(self):
        r, calls = self.run_step("password", FAKE_FAIL_ON="stdin")
        self.assertNotEqual(r.returncode, 0)

    def test_password_guards(self):
        for bad in ("", "CHANGE_ME_please_now", "short"):
            r, calls = self.run_step("password", OPSENSE_APP_PASSWORD=bad)
            self.assertNotEqual(r.returncode, 0, bad)
            self.assertEqual(calls, [], "psql must not be reached with a bad password")

    def test_verify_fail_line_is_nonzero(self):
        r, _ = self.run_step("verify", FAKE_VERIFY="fail")
        self.assertNotEqual(r.returncode, 0); self.assertIn("FAIL", r.stdout)

    def test_verify_error_line_with_psql_exit_zero_is_nonzero(self):
        r, _ = self.run_step("verify", FAKE_VERIFY="errexit0")
        self.assertNotEqual(r.returncode, 0)

    def test_verify_without_any_pass_is_nonzero(self):
        r, _ = self.run_step("verify", FAKE_VERIFY="nopass")
        self.assertNotEqual(r.returncode, 0)

    def test_verify_psql_failure_is_nonzero_even_if_pipeline_would_end_ok(self):
        r, _ = self.run_step("verify", FAKE_FAIL_ON="test_schema")
        self.assertNotEqual(r.returncode, 0)

    def test_verify_success(self):
        r, calls = self.run_step("verify")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(calls, ["m09_030_validate_live.sql", "test_schema.sql", "verify_rls.sql"])

class TestScriptSource(unittest.TestCase):
    def setUp(self): self.src = open(SCRIPT).read()
    def test_no_error_suppression(self):
        import re
        for ln in self.src.splitlines():
            code = ln.split("#")[0] if not ln.lstrip().startswith("#") else ""
            if "|| true" in code and "psql" in code: self.fail("psql failure suppressed: " + ln)
        self.assertNotIn("set +e", self.src)
        self.assertNotRegex(self.src, r"psql[^\n]*\|\s*(grep|tail|head)")      # no psql piped into a filter
    def test_strict_flags(self):
        self.assertIn("set -euo pipefail", self.src)
        self.assertIn("-X -v ON_ERROR_STOP=1", self.src)

@unittest.skipUnless(os.environ.get("OPSENSE_LIVE_PG") == "1" and _sh.which("psql"),
                     "live test: set OPSENSE_LIVE_PG=1 and PG* env for a DISPOSABLE database")
class TestLiveFailingSql(unittest.TestCase):
    """REAL psql + deliberately failing SQL. Requires a disposable database (the script's migrations are NOT run here)."""
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.tmp, "scripts")); os.makedirs(os.path.join(self.tmp, "migrations"))
        shutil.copy(SCRIPT, os.path.join(self.tmp, "scripts", "local_pg.sh"))
    def tearDown(self): shutil.rmtree(self.tmp, ignore_errors=True)
    def _run(self, files):
        for n, sql in files.items():
            open(os.path.join(self.tmp, "migrations", n), "w").write(sql)
        return subprocess.run(["bash", os.path.join(self.tmp, "scripts", "local_pg.sh"), "migrate"],
                              capture_output=True, text=True)
    def test_failing_sql_exits_nonzero_and_stops(self):
        r = self._run({"001_ok.sql": "CREATE TEMP TABLE t1(a int);\n",
                       "002_bad.sql": "SELECT 1/0;\n",
                       "003_never.sql": "SELECT 'SHOULD_NOT_RUN_MARKER';\n"})
        self.assertNotEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("division by zero", r.stdout + r.stderr)
        self.assertNotIn("003_never.sql", r.stdout)
    def test_syntax_error_exits_nonzero(self):
        r = self._run({"001_bad.sql": "SELEC nonsense;\n"})
        self.assertNotEqual(r.returncode, 0)
    def test_success_exits_zero(self):
        r = self._run({"001_ok.sql": "SELECT 1;\n", "002_ok.sql": "SELECT 2;\n"})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

if __name__ == "__main__":
    unittest.main()
