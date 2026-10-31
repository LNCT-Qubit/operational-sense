"""Quote-aware extraction of VALUES tuples from the project's SQL import files.

This is NOT a SQL parser or validator. It only splits `VALUES (...), (...)` lists
so the data inside the import scripts can be audited without a database.
"""
import re


def _scan_tuples(sql, start):
    """Return (list_of_tuple_strings, end_index) for the VALUES list starting at `start`."""
    n, i, depth, in_q, tups, t0 = len(sql), start, 0, False, [], None
    while i < n:
        c = sql[i]
        if in_q:
            if c == "'":
                if i + 1 < n and sql[i + 1] == "'":
                    i += 2
                    continue
                in_q = False
        elif c == "'":
            in_q = True
        elif c == "(":
            if depth == 0:
                t0 = i
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                tups.append(sql[t0:i + 1])
            elif depth < 0:
                break
        elif depth == 0:
            if c == ";":
                break
            if c not in " \n\t\r,":
                break  # AS / ON / SELECT ... : end of the list
        i += 1
    return tups, i


def values_blocks(sql):
    """List of tuple-string lists, one per VALUES keyword, in file order."""
    blocks = []
    for m in re.finditer(r"\bVALUES\b", sql, re.I):
        tups, _ = _scan_tuples(sql, m.end())
        blocks.append(tups)
    return blocks


def split_fields(tup):
    body = tup.strip()[1:-1]
    fields, cur, in_q, depth, i = [], "", False, 0, 0
    while i < len(body):
        c = body[i]
        if in_q:
            cur += c
            if c == "'":
                if i + 1 < len(body) and body[i + 1] == "'":
                    cur += "'"
                    i += 1
                else:
                    in_q = False
        elif c == "'":
            in_q = True
            cur += c
        elif c == "(":
            depth += 1
            cur += c
        elif c == ")":
            depth -= 1
            cur += c
        elif c == "," and depth == 0:
            fields.append(cur.strip())
            cur = ""
        else:
            cur += c
        i += 1
    fields.append(cur.strip())
    return fields


def unquote(tok):
    """SQL literal -> python value. NULL / NULL::type -> None, TRUE/FALSE -> bool, ints -> int."""
    t = tok.strip()
    if re.match(r"^NULL(::\w+)?$", t, re.I):
        return None
    if re.match(r"^(TRUE|FALSE)$", t, re.I):
        return t.upper() == "TRUE"
    if re.match(r"^-?\d+$", t):
        return int(t)
    m = re.match(r"^'(.*)'(::\w+)?$", t, re.S)
    if m:
        return m.group(1).replace("''", "'")
    return t


def rows(tuples):
    return [[unquote(f) for f in split_fields(t)] for t in tuples]


def alias_columns(sql, alias="v"):
    m = re.search(r"\bAS\s+%s\s*\(([^)]*)\)" % re.escape(alias), sql, re.I)
    return [c.strip() for c in m.group(1).split(",")] if m else None
