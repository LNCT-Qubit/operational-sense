"""TEST HARNESS ONLY: a minimal DB-API-like connection that runs SQL through one persistent `psql` process.

Why: psycopg could not be installed in the offline build environment, but a real PostgreSQL + pgvector was available.
This lets the REAL retrieval.repository.PostgresRepository SQL run against the real database. It substitutes bound
parameters client-side with strict literal quoting (fine for a harness, NOT a production driver) and returns rows as
strings. It does NOT test the psycopg driver path. Uses the standard PG* environment variables.
"""
from __future__ import annotations

import re
import subprocess
import uuid
from types import SimpleNamespace

RS, FS, END = "~~RS~~", "~~FS~~", "~~END~~"


def literal(v) -> str:
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, (list, tuple)):
        return "ARRAY[" + ",".join(literal(x) for x in v) + "]" + ("::uuid[]" if v and isinstance(v[0], uuid.UUID) else "")
    return "'" + str(v).replace("'", "''") + "'"


class ShimError(RuntimeError):
    pass


class _Cursor:
    def __init__(self, names, rows, rowcount):
        self.description = [SimpleNamespace(name=n) for n in names]; self._rows = rows; self.rowcount = rowcount
    def fetchall(self): return list(self._rows)
    def fetchone(self): return self._rows[0] if self._rows else None


class PsqlConnection:
    def __init__(self):
        self.p = subprocess.Popen(["psql", "-X", "-A", "-q", "-v", "ON_ERROR_STOP=0"], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        for cmd in (f"\\pset fieldsep '{FS}'", f"\\pset recordsep '{RS}'", "\\pset footer off", "\\pset null '<NULL>'"):
            self._send(cmd)
        self.raw("SELECT 1")

    def _send(self, text):
        self.p.stdin.write(text + "\n"); self.p.stdin.flush()

    def raw(self, sql):
        self._send(sql.rstrip().rstrip(";") + ";"); self._send(f"\\echo {END}")
        buf = []
        while True:
            line = self.p.stdout.readline()
            if line == "" : raise ShimError("psql exited")
            if line.strip() == END: break
            buf.append(line)
        return "".join(buf)

    def execute(self, sql, params=None):
        if isinstance(params, dict):
            sql = re.sub(r"%\((\w+)\)s", lambda m: literal(params[m.group(1)]), sql)
        elif params:
            it = iter(params); sql = re.sub(r"%s", lambda m: literal(next(it)), sql)
        out = self.raw(sql)
        if re.search(r"^(psql: )?ERROR:", out, re.M):
            raise ShimError(out.strip().splitlines()[0])
        out = out.rstrip("\n")
        m = re.fullmatch(r"(INSERT \d+ |UPDATE |DELETE )(\d+)", out.strip())
        if m: return _Cursor([], [], int(m.group(2)))
        if FS not in out and RS not in out and out.strip() in ("", "SET", "BEGIN", "COMMIT", "ROLLBACK"):
            return _Cursor([], [], 0)
        recs = [r for r in out.split(RS) if r.strip("\n") != ""]
        if not recs: return _Cursor([], [], 0)
        names = recs[0].split(FS)
        rows = [tuple(None if c == "<NULL>" else c for c in r.strip("\n").split(FS)) for r in recs[1:]]
        return _Cursor(names, rows, len(rows))

    def close(self):
        try: self._send("\\q")
        finally: self.p.wait(timeout=10)
