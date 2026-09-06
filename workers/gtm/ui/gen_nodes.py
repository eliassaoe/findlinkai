#!/usr/bin/env python3
"""Inject nodes/*.js into index.html as NODE_SRC.

The n8n Code node bodies live as real JavaScript files in nodes/, where they
can be read, syntax-checked and run against fakes. This writes them into the
console between two markers as a JSON-encoded object, so the console stays one
file and the generator never carries a hand-escaped string again — the last
three bugs in this flow were hand-escaped strings.

    python3 gen_nodes.py            # rewrite the block in index.html
    python3 gen_nodes.py --check    # exit 1 if index.html is stale
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
NODES = HERE / "nodes"
MASTER = HERE / "index.html"
BEGIN = "/* NODES:BEGIN — generated from nodes/*.js by gen_nodes.py, do not edit */"
END = "/* NODES:END */"


def block() -> str:
    src = {p.stem: p.read_text(encoding="utf-8").rstrip("\n") for p in sorted(NODES.glob("*.js"))}
    body = json.dumps(src, indent=2, ensure_ascii=False)
    return f"{BEGIN}\nconst NODE_SRC = {body};\n{END}"


def main() -> int:
    html = MASTER.read_text(encoding="utf-8")
    new = block()
    if BEGIN in html and END in html:
        i, j = html.index(BEGIN), html.index(END) + len(END)
        out = html[:i] + new + html[j:]
    else:
        anchor = "const uid = () =>"
        if anchor not in html:
            sys.exit("no NODES markers and no anchor to place them")
        out = html.replace(anchor, new + "\n\n" + anchor, 1)
    if "--check" in sys.argv:
        if out != html:
            print("index.html is stale — run gen_nodes.py"); return 1
        print("nodes are current"); return 0
    if out != html:
        MASTER.write_text(out, encoding="utf-8")
        print(f"wrote NODE_SRC with {len(list(NODES.glob('*.js')))} nodes into index.html")
    else:
        print("nodes already current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
