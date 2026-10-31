"""Minimal JSON Schema (2020-12 subset) validator, standard library only.

WHY THIS EXISTS: the `jsonschema` package cannot be assumed to be installed (the build
environment was offline). This module implements exactly the keywords that
canonical_schema.json uses, so `python -m unittest` works with no third-party packages.
If `jsonschema` IS installed, tests/test_case_schema.py also cross-checks every sample with it.

Supported: type (name or list), enum, const, pattern, minLength, maxLength, minimum,
maximum, required, properties, additionalProperties (bool), items, minItems, maxItems,
uniqueItems, $ref (#/$defs/...), allOf, anyOf, oneOf, if/then/else, format (date, date-time).
Unknown keywords are ignored EXCEPT that a keyword listed in UNSUPPORTED raises, so a schema
edit can never silently become un-enforced.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Iterator

UNSUPPORTED = {"not", "patternProperties", "propertyNames", "dependentRequired", "dependentSchemas",
               "contains", "prefixItems", "unevaluatedProperties", "unevaluatedItems", "$dynamicRef"}
_ANNOTATION = {"$schema", "$id", "title", "description", "default", "examples", "$defs", "$comment"}


class SchemaError(Exception):
    """The schema itself uses something this validator does not implement."""


def _type_ok(value: Any, name: str) -> bool:
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if name == "string":
        return isinstance(value, str)
    if name == "array":
        return isinstance(value, list)
    if name == "object":
        return isinstance(value, dict)
    raise SchemaError(f"unknown type {name!r}")


def _format_ok(value: str, fmt: str) -> bool:
    try:
        if fmt == "date":
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                return False
            date.fromisoformat(value)
        elif fmt == "date-time":
            datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _resolve(root: dict, ref: str) -> dict:
    if not ref.startswith("#/"):
        raise SchemaError(f"only local $ref supported, got {ref!r}")
    node: Any = root
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def _equal(a: Any, b: Any) -> bool:  # json equality: True != 1
    return type(a) is type(b) and a == b


def iter_errors(instance: Any, schema: dict, root: dict | None = None, path: str = "$") -> Iterator[tuple[str, str]]:
    """Yield (json_path, message) for every violation."""
    root = root if root is not None else schema
    bad = UNSUPPORTED & set(schema)
    if bad:
        raise SchemaError(f"unsupported keyword(s) {sorted(bad)} at {path}")
    if "$ref" in schema:
        yield from iter_errors(instance, _resolve(root, schema["$ref"]), root, path)
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(instance, t) for t in types):
            yield path, f"expected type {'/'.join(types)}, got {type(instance).__name__}"
            return  # further keyword checks would only add noise
    if "const" in schema and not _equal(instance, schema["const"]):
        yield path, f"must equal {schema['const']!r}"
    if "enum" in schema and not any(_equal(instance, e) for e in schema["enum"]):
        yield path, f"{instance!r} is not one of {schema['enum']!r}"
    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            yield path, f"shorter than {schema['minLength']}"
        if "maxLength" in schema and len(instance) > schema["maxLength"]:
            yield path, f"longer than {schema['maxLength']}"
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            yield path, f"does not match pattern {schema['pattern']!r}"
        if "format" in schema and not _format_ok(instance, schema["format"]):
            yield path, f"not a valid {schema['format']}"
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            yield path, f"{instance} is below minimum {schema['minimum']}"
        if "maximum" in schema and instance > schema["maximum"]:
            yield path, f"{instance} is above maximum {schema['maximum']}"
    if isinstance(instance, dict):
        for name in schema.get("required", []):
            if name not in instance:
                yield path, f"missing required property {name!r}"
        props = schema.get("properties", {})
        for name, sub in props.items():
            if name in instance:
                yield from iter_errors(instance[name], sub, root, f"{path}.{name}")
        if schema.get("additionalProperties") is False:
            for name in instance:
                if name not in props:
                    yield path, f"unexpected property {name!r}"
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            yield path, f"fewer than {schema['minItems']} items"
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            yield path, f"more than {schema['maxItems']} items"
        if schema.get("uniqueItems"):
            seen: list = []
            for item in instance:
                if any(_equal(item, s) for s in seen):
                    yield path, "items are not unique"
                    break
                seen.append(item)
        if "items" in schema:
            for i, item in enumerate(instance):
                yield from iter_errors(item, schema["items"], root, f"{path}[{i}]")
    for sub in schema.get("allOf", []):
        yield from iter_errors(instance, sub, root, path)
    if "anyOf" in schema and not any(not list(iter_errors(instance, s, root, path)) for s in schema["anyOf"]):
        yield path, "does not match any allowed alternative"
    if "oneOf" in schema:
        n = sum(1 for s in schema["oneOf"] if not list(iter_errors(instance, s, root, path)))
        if n != 1:
            yield path, f"matches {n} alternatives, expected exactly 1"
    if "if" in schema:
        if not list(iter_errors(instance, schema["if"], root, path)):
            if "then" in schema:
                yield from iter_errors(instance, schema["then"], root, path)
        elif "else" in schema:
            yield from iter_errors(instance, schema["else"], root, path)


def validate(instance: Any, schema: dict) -> list[tuple[str, str]]:
    """Return a list of (path, message); empty list = valid."""
    return list(iter_errors(instance, schema))
