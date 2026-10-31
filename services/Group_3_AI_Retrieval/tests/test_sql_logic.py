"""SQL logic exercised on SQLite (NOT PostgreSQL) plus static checks of the SQL/shell files.

SQLite proves the matching LOGIC of the two fixed statements on the project's real data. It does not prove
PostgreSQL syntax, constraints, RLS or pgvector - those need the live checks in README_M09.md.
"""
import os
import re
import sqlite3
import subprocess
import unittest
from m09 import loaders as L
from tests.common import PROJECT, ROOT


def stmt(path, start_pattern):
    with open(os.path.join(PROJECT, path), encoding="utf-8") as fh:
        sql = fh.read()
    m = re.search(start_pattern + r".*?;", sql, re.S)
    return m.group(0)


class SubsystemFkLogic(unittest.TestCase):
    def test_update_resolves_39_and_leaves_11_null(self):
        cases, _, _, _ = L.load_cases(PROJECT)
        m06 = L.load_m06(PROJECT)
        db = sqlite3.connect(":memory:")
        db.create_function("btrim", 1, lambda s: s.strip() if s is not None else None)
        db.executescript("""
          CREATE TABLE subsystem(subsystem_id INTEGER PRIMARY KEY AUTOINCREMENT, subsystem_name TEXT UNIQUE);
          CREATE TABLE class_subsystem(equipment_class_id TEXT, subsystem_id INT, PRIMARY KEY(equipment_class_id, subsystem_id));
          CREATE TABLE operational_case(case_reference TEXT, organization_id TEXT, equipment_class_id TEXT,
              subsystem_source_label TEXT, subsystem_id INT, updated_at TEXT);""")
        for name in sorted({m["subsystem_assembly"].strip() for m in m06}):
            db.execute("INSERT INTO subsystem(subsystem_name) VALUES (?)", (name,))
        for m in m06:
            sid = db.execute("SELECT subsystem_id FROM subsystem WHERE subsystem_name=?", (m["subsystem_assembly"].strip(),)).fetchone()[0]
            db.execute("INSERT OR IGNORE INTO class_subsystem VALUES (?,?)", (m["equipment_class_id"], sid))
        org = "b2a7dce7-b449-4381-ba3b-b520f2c88c2e"
        for c in cases:
            db.execute("INSERT INTO operational_case VALUES (?,?,?,?,NULL,NULL)",
                       (c["case_reference"], org, c["equipment_class_id"], c["subsystem_source_label"]))
        sql = stmt("sql/m09/m09_010_resolve_subsystem_fk.sql", r"UPDATE operational_case c")
        sql = sql.replace("operational_case c", "operational_case AS c").replace("now()", "'now'")
        db.execute(sql)
        self.assertEqual(db.execute("SELECT count(*) FROM operational_case WHERE subsystem_id IS NOT NULL").fetchone()[0], 39)
        self.assertEqual(db.execute("SELECT count(*) FROM operational_case WHERE subsystem_id IS NULL").fetchone()[0], 11)
        # composite-FK rule: every assigned subsystem is valid for the case's class
        bad = db.execute("""SELECT count(*) FROM operational_case c WHERE c.subsystem_id IS NOT NULL AND NOT EXISTS
                            (SELECT 1 FROM class_subsystem cs WHERE cs.equipment_class_id=c.equipment_class_id
                             AND cs.subsystem_id=c.subsystem_id)""").fetchone()[0]
        self.assertEqual(bad, 0)
        # idempotent
        db.execute(sql)
        self.assertEqual(db.execute("SELECT count(subsystem_id) FROM operational_case").fetchone()[0], 39)


class SpareJoinLogic(unittest.TestCase):
    def _run(self, case_specific):
        seed, links = L.load_links(PROJECT)
        parts = L.load_spare_parts(PROJECT)
        cases, _, _, _ = L.load_cases(PROJECT)
        db = sqlite3.connect(":memory:")
        db.executescript("""
          CREATE TABLE operational_case(case_id INTEGER PRIMARY KEY, case_reference TEXT);
          CREATE TABLE spare_part_reference(spare_part_id INTEGER PRIMARY KEY, part_name TEXT, compatibility_note TEXT);
          CREATE TABLE _step4_spare_link_seed(case_reference TEXT, part_name TEXT);
          CREATE TABLE case_spare_part(case_id INT, spare_part_id INT, PRIMARY KEY(case_id, spare_part_id));""")
        db.executemany("INSERT INTO operational_case(case_reference) VALUES (?)", [(c["case_reference"],) for c in cases])
        db.executemany("INSERT INTO spare_part_reference(part_name, compatibility_note) VALUES (?,?)",
                       [(p["part_name"], p["compatibility_note"]) for p in parts])
        db.executemany("INSERT INTO _step4_spare_link_seed VALUES (?,?)", [(l["case_reference"], l["part_name"]) for l in links])
        sql = stmt("Operational_Sense_Step4_Links_and_Verification_FIXED.sql", r"INSERT INTO case_spare_part")
        sql = re.sub(r"position\((.+?) in (coalesce\(.+?\))\)", r"instr(\2, \1)", sql, flags=re.S)
        if not case_specific:  # emulate the ORIGINAL join
            sql = re.sub(r"\s+AND instr\(.*?\) > 0", "", sql, flags=re.S)
        db.execute(sql)
        return db

    def test_fixed_join_gives_98_case_specific_links(self):
        db = self._run(True)
        self.assertEqual(db.execute("SELECT count(*) FROM case_spare_part").fetchone()[0], 98)
        wrong = db.execute("""SELECT count(*) FROM case_spare_part x JOIN operational_case c ON c.case_id=x.case_id
              JOIN spare_part_reference s ON s.spare_part_id=x.spare_part_id
              WHERE instr(s.compatibility_note, c.case_reference)=0""").fetchone()[0]
        self.assertEqual(wrong, 0)

    def test_original_name_only_join_fans_out(self):
        db = self._run(False)
        n = db.execute("SELECT count(*) FROM case_spare_part").fetchone()[0]
        self.assertGreater(n, 98)  # documents the defect (119 on the cleaned seed; 120 in the original data)


class StaticChecks(unittest.TestCase):
    def sql_files(self):
        for d, _, fs in os.walk(PROJECT):
            for f in fs:
                if f.endswith(".sql") and "schema" + os.sep not in os.path.join(d, f):
                    yield os.path.join(d, f)

    def test_sql_quotes_balanced_and_transactions_paired(self):
        for p in self.sql_files():
            with open(p, encoding="utf-8") as fh:
                s = fh.read()
            s2 = re.sub(r"^\\[^\n]*", "", s, flags=re.M)  # psql meta-commands such as \echo '--- text'
            s2 = re.sub(r"--[^\n]*", "", s2)
            s2 = re.sub(r"\$(\w*)\$.*?\$\1\$", "", s2, flags=re.S)  # drop dollar-quoted bodies
            self.assertEqual(s2.count("'") % 2, 0, "unbalanced quotes: " + p)
            if re.search(r"^\s*BEGIN;", s2, re.M):
                self.assertTrue(re.search(r"^\s*(COMMIT|ROLLBACK);", s2, re.M), "BEGIN without COMMIT/ROLLBACK: " + p)

    def test_shell_scripts_pass_bash_n(self):
        for f in ("migrate.sh", "seed.sh", "load_all_m09.sh"):
            r = subprocess.run(["bash", "-n", os.path.join(PROJECT, "scripts", f)], capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, f + r.stderr)

    def test_load_all_references_only_existing_files_in_fk_order(self):
        with open(os.path.join(PROJECT, "scripts", "load_all_m09.sh"), encoding="utf-8") as fh:
            txt = fh.read()
        files = re.findall(r"^run (\S+\.sql)", txt, re.M)
        self.assertGreaterEqual(len(files), 10)
        for f in files:
            self.assertTrue(os.path.exists(os.path.join(PROJECT, f)), f)
        order = {f: i for i, f in enumerate(files)}
        need_before = [("seed_data/005_seed_demo_organization.sql", "seed_data/020_seed_asset_hierarchy.sql"),
                       ("seed_data/010_seed_reference_from_m06.sql", "Operational_Sense_Step4_Taxonomy_Vocabulary_FIXED.sql"),
                       ("step4_01_import_sources.sql", "Operational_Sense_Step4_4_Safety_and_Spare_Parts_FIXED.sql"),
                       ("Operational_Sense_Step4_Taxonomy_Vocabulary_FIXED.sql", "Operational_Sense_Step4_3_Measurement_References.sql"),
                       ("Operational_Sense_Step4_5_Import_Operational_Cases.sql", "Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql"),
                       ("Operational_Sense_Step4_6_Import_Diagnostic_Steps.sql", "Operational_Sense_Step4_Links_and_Verification_FIXED.sql"),
                       ("Operational_Sense_Step4_Links_and_Verification_FIXED.sql", "sql/m09/m09_010_resolve_subsystem_fk.sql")]
        for a, b in need_before:
            self.assertLess(order[a], order[b], "%s must run before %s" % (a, b))

    def test_migrations_unchanged_001_to_007(self):
        names = sorted(os.listdir(os.path.join(PROJECT, "migrations")))
        self.assertEqual(names[0], "001_extensions.sql")
        # 001-007 are the Group 2 baseline; 008 (embedding provenance, Group 3 Final) is the only addition.
        self.assertEqual(names[:7], ["001_extensions.sql", "002_taxonomy_tables.sql", "003_reference_tables.sql",
                                     "004_hierarchy_and_assets.sql", "005_cases.sql", "006_historical_case_vector.sql",
                                     "007_row_level_security.sql"])
        self.assertEqual(names[7:], ["008_embedding_metadata.sql"])
        self.assertEqual(len(names), 8)


if __name__ == "__main__":
    unittest.main()
