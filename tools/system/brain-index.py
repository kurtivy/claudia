#!/usr/bin/env python3
"""
brain-index.py — Build and query an FTS5 index over brain files.

Usage:
  python3 brain-index.py rebuild          # Rebuild index from all brain files
  python3 brain-index.py search "query"   # Search with FTS5 ranking
  python3 brain-index.py search "query" N # Return top N results (default 5)
"""

import sqlite3
import os
import sys
import re
from pathlib import Path

BRAIN = Path(os.path.expanduser("~/.claudia"))
DB_PATH = BRAIN / "brain.db"

# Directories to index and their type defaults
INDEX_DIRS = {
    BRAIN / "memories" / "entries": "memory",
    BRAIN / "knowledge" / "ai": "knowledge",
    BRAIN / "knowledge" / "crypto": "knowledge",
    BRAIN / "knowledge" / "protocols": "knowledge",
    BRAIN / "social" / "telegram": "contact",
    BRAIN / "social" / "twitter": "contact",
    BRAIN / "social" / "email": "contact",
}

def parse_frontmatter(text):
    """Extract YAML frontmatter fields from markdown."""
    fields = {}
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', text, re.DOTALL)
    if not match:
        return fields, text
    fm_text = match.group(1)
    body = text[match.end():]
    for line in fm_text.strip().split('\n'):
        if ':' in line:
            key, val = line.split(':', 1)
            fields[key.strip()] = val.strip()
    return fields, body

def extract_summary(body):
    """Get first non-empty, non-heading line as summary."""
    for line in body.split('\n'):
        line = line.strip()
        if line and not line.startswith('#'):
            return line[:200]
    return ""

def init_db(conn):
    """Create FTS5 virtual table."""
    conn.execute("DROP TABLE IF EXISTS entries")
    conn.execute("""
        CREATE VIRTUAL TABLE entries USING fts5(
            filename,
            filepath,
            entry_type,
            domain,
            importance,
            keywords,
            summary,
            body,
            tokenize='porter unicode61'
        )
    """)

def rebuild(conn):
    """Rebuild the full index from brain files."""
    init_db(conn)
    count = 0
    for dir_path, default_type in INDEX_DIRS.items():
        if not dir_path.exists():
            continue
        for f in sorted(dir_path.glob("*.md")):
            if f.name.startswith('_'):
                continue
            text = f.read_text(encoding='utf-8', errors='replace')
            fields, body = parse_frontmatter(text)
            summary = extract_summary(body)
            conn.execute(
                "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f.stem,
                    str(f),
                    fields.get('type', fields.get('subtype', default_type)),
                    fields.get('domain', ''),
                    fields.get('importance', ''),
                    fields.get('keywords', ''),
                    summary,
                    body[:1000],  # cap body to keep index lean
                )
            )
            count += 1
    conn.commit()
    print(f"Indexed {count} files into {DB_PATH}")

def search(conn, query, limit=5):
    """Search with FTS5 ranking. Returns ranked results."""
    # Use OR matching so partial hits rank lower but still appear
    terms = query.split()
    if len(terms) > 1:
        fts_query = " OR ".join(terms)
    else:
        fts_query = query

    try:
        rows = conn.execute("""
            SELECT filename, entry_type, domain, importance, keywords, summary,
                   rank
            FROM entries
            WHERE entries MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (fts_query, limit)).fetchall()
    except sqlite3.OperationalError:
        # Fallback: quote each term
        fts_query = " OR ".join(f'"{t}"' for t in terms)
        rows = conn.execute("""
            SELECT filename, entry_type, domain, importance, keywords, summary,
                   rank
            FROM entries
            WHERE entries MATCH ?
            ORDER BY rank
            LIMIT ?
        """, (fts_query, limit)).fetchall()

    if not rows:
        print(f"No results for: {query}")
        return

    for row in rows:
        fname, etype, domain, importance, keywords, summary, rank = row
        meta = f"[{etype}/{domain}/{importance}]" if domain else f"[{etype}]"
        kw = f" | {keywords}" if keywords else ""
        print(f"- `{fname}` {meta} (rank: {rank:.1f})")
        if summary:
            print(f"  {summary[:120]}")
        if keywords:
            print(f"  keywords: {keywords}")
        print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1]
    conn = sqlite3.connect(str(DB_PATH))

    if cmd == "rebuild":
        rebuild(conn)
    elif cmd == "search":
        if len(sys.argv) < 3:
            print("Usage: brain-index.py search \"query\" [limit]")
            sys.exit(1)
        query = sys.argv[2]
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
        search(conn, query, limit)
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)

    conn.close()
