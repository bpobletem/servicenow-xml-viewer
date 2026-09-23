#!/usr/bin/env python3
"""Pull ServiceNow XML that the user pasted into a Claude Code session out of the
transcript and write each <record_update> block to its own file.

Large pastes are not written to disk anywhere, so after a context compaction the only
copy left is the session .jsonl. Re-asking the user for a 1 MB paste is rude and slow;
this recovers it instead.

Usage:
    python3 extract_xml.py <transcript.jsonl> <out_dir> [--min-size 5000]

Prints one line per extracted file: <path> <bytes> <table attribute>
"""
import argparse
import json
import pathlib
import re
import sys

BLOCK_START = re.compile(r"<record_update\b")
BLOCK_END = re.compile(r"</record_update>")
TABLE_ATTR = re.compile(r'<record_update[^>]*\btable="([^"]+)"')


def user_texts(path):
    """Yield the text of every user message, newest last."""
    for line in path.open(errors="replace"):
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        message = entry.get("message")
        if not message or message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            yield content
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    yield block["text"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("transcript")
    ap.add_argument("out_dir")
    ap.add_argument("--min-size", type=int, default=5000,
                    help="ignore messages smaller than this (skips summaries that merely "
                         "mention table names)")
    args = ap.parse_args()

    transcript = pathlib.Path(args.transcript)
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # A continuation summary quotes <record_update table="..."> without carrying the XML,
    # and it is newer than the original paste. Rank by how many *closed* blocks a message
    # holds so the real paste wins regardless of order; break ties by recency.
    candidates = []
    for index, text in enumerate(user_texts(transcript)):
        if len(text) < args.min_size:
            continue
        closed = len(BLOCK_END.findall(text))
        if closed:
            candidates.append((closed, index, text))
    if not candidates:
        print("no complete <record_update> block found in the transcript "
              "(a paste that is still open may have been truncated)", file=sys.stderr)
        return 1

    text = max(candidates)[2]
    starts = [m.start() for m in BLOCK_START.finditer(text)]
    ends = [m.end() for m in BLOCK_END.finditer(text)]

    written = 0
    for i, (start, end) in enumerate(zip(starts, ends)):
        if end <= start:
            continue
        block = text[start:end]
        table = TABLE_ATTR.search(block)
        dest = out_dir / f"real_{i}.xml"
        dest.write_text(block)
        print(f"{dest} {dest.stat().st_size} {table.group(1) if table else '?'}")
        written += 1

    if not written:
        print("no complete record_update blocks extracted", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
