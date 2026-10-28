"""Refresh the optional file:// snapshot after editing data/articles.json. Standard library only."""
from pathlib import Path
import json
root = Path(__file__).resolve().parent.parent
data = json.loads((root / "data/articles.json").read_text(encoding="utf-8"))
output = "// Generated from data/articles.json. Do not edit; run python3 scripts/sync-local-data.py.\nwindow.ARTICLES_LOCAL = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
(root / "js/articles-local.js").write_text(output, encoding="utf-8")
print("Updated js/articles-local.js from data/articles.json")
