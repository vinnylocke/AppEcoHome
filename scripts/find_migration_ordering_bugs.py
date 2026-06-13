#!/usr/bin/env python3
"""
Scan supabase/migrations/ for ordering bugs.

A bug = migration F references a table/view T using ALTER / UPDATE / DELETE /
INSERT / CREATE INDEX ON, where T's first CREATE TABLE / CREATE VIEW lives
in a chronologically LATER migration than F.

Prints rows of:   <referencing_migration> <object> <creator_migration>

Run from repo root:  python scripts/find_migration_ordering_bugs.py
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "supabase" / "migrations"

create_table = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)
create_view = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)",
    re.IGNORECASE,
)

# Reference patterns (capture the target object name in group 1).
ref_patterns = [
    re.compile(r"ALTER\s+(?:TABLE|VIEW|MATERIALIZED\s+VIEW)\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"\bUPDATE\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b", re.IGNORECASE),
    re.compile(r"\bDELETE\s+FROM\s+(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\b", re.IGNORECASE),
    re.compile(r"\bINSERT\s+INTO\s+(?:public\.)?([a-z_][a-z0-9_]*)\b", re.IGNORECASE),
    re.compile(r"\bTRUNCATE\s+(?:TABLE\s+)?(?:ONLY\s+)?(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[a-z_][a-z0-9_]*\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"CREATE\s+TRIGGER\s+[a-z_][a-z0-9_]*\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+[^O]+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?[\"a-z_][^\s]*\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"CREATE\s+POLICY\s+[\"a-z_][^\s]*\s+ON\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
    re.compile(r"COMMENT\s+ON\s+(?:TABLE|VIEW|COLUMN)\s+(?:public\.)?([a-z_][a-z0-9_]*)", re.IGNORECASE),
]

# Build: object name -> first-creating migration filename.
creators: dict[str, str] = {}
files = sorted(p.name for p in ROOT.glob("*.sql"))
for f in files:
    text = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
    for m in create_table.finditer(text):
        name = m.group(1).lower()
        if name not in creators:
            creators[name] = f
    for m in create_view.finditer(text):
        name = m.group(1).lower()
        if name not in creators:
            creators[name] = f

# Now scan each file for references to objects created in a LATER file.
problems: list[tuple[str, str, str]] = []
for f in files:
    text = (ROOT / f).read_text(encoding="utf-8", errors="ignore")
    # Strip line + block comments to avoid false matches.
    text_clean = re.sub(r"--[^\n]*", "", text)
    text_clean = re.sub(r"/\*.*?\*/", "", text_clean, flags=re.DOTALL)
    seen: set[str] = set()
    for pat in ref_patterns:
        for m in pat.finditer(text_clean):
            target = m.group(1).lower()
            if target in seen:
                continue
            creator = creators.get(target)
            if creator and creator > f:
                problems.append((f, target, creator))
                seen.add(target)

# Dedupe + sort.
unique = sorted(set(problems))
for ref, obj, creator in unique:
    print(f"{ref}  ->  {obj}  (created in {creator})")

print(f"\nTotal problems: {len(unique)}", file=sys.stderr)
