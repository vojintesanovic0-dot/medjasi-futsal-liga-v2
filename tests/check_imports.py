#!/usr/bin/env python3
"""Check that relative named JavaScript imports target existing files and exports."""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = [
    path for path in ROOT.rglob("*") if path.is_file() and path.suffix in {".js", ".mjs"}
    if ".git" not in path.parts and "node_modules" not in path.parts
]
EXPORTS = {}
for path in FILES:
    source = path.read_text(encoding="utf-8")
    names = set(re.findall(r"\bexport\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)", source))
    for match in re.finditer(r"\bexport\s*\{([^}]+)\}", source):
        names.update(name.strip().split(" as ")[-1].strip() for name in match.group(1).split(",") if name.strip())
    EXPORTS[path.resolve()] = names

problems = []
for path in FILES:
    source = path.read_text(encoding="utf-8")
    pattern = re.compile(r"\bimport\s*\{([^}]+)\}\s*from\s*['\"](\.[^'\"]+)['\"]", re.S)
    for match in pattern.finditer(source):
        target = (path.parent / match.group(2)).resolve()
        if not target.exists():
            problems.append(f"{path.relative_to(ROOT)}: missing module {match.group(2)}")
            continue
        for item in match.group(1).split(","):
            name = item.strip().split(" as ")[0].strip()
            if name and name not in EXPORTS.get(target, set()):
                problems.append(f"{path.relative_to(ROOT)}: '{name}' is not exported by {match.group(2)}")

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"IMPORTI OK — checked {len(FILES)} JavaScript files.")
