"""Regenerate offline UI subsets; source fonts/licenses are supplied outside the repo.

Usage: python scripts/build-ui-fonts.py /path/to/font-cache
Requires fonttools[woff]. Normal builds use the committed WOFF2 files.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
cache = Path(sys.argv[1])
output = root / "src/assets/fonts"
output.mkdir(parents=True, exist_ok=True)
sources = [root / "index.html", *sorted((root / "src").rglob("*.ts")), root / "src/style.css"]
text = "".join(p.read_text() for p in sources if not p.name.endswith(".test.ts"))
characters = set(text) | set(chr(c) for c in range(32, 127))
han = {c for c in characters if re.match(r"[\u3400-\u9fff]", c)}
credits = []
for source, family, slug, license_file, url in [
    ("MaokenAssortedSans.ttf", "Ballpoint Marker", "ballpoint-marker", "maoken-OFL.txt", "https://github.com/maoken-fonts/MaokenAssortedSans"),
    ("Yozai-Medium.ttf", "Ballpoint Hand", "ballpoint-hand", "yozai-OFL.txt", "https://github.com/lxgw/yozai-font"),
]:
    font = TTFont(cache / source)
    supported = set(font.getBestCmap())
    missing = sorted(c for c in han if ord(c) not in supported)
    if missing:
        raise ValueError(f"{source} is missing Chinese characters: {''.join(missing)}")
    options = subset.Options()
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes={ord(c) for c in characters if ord(c) in supported})
    subsetter.subset(font)
    # Derivative family names must not contain either upstream reserved font name.
    names = {1: family, 2: "Regular", 3: f"{slug}-ui-1", 4: family,
             6: family.replace(" ", "") + "-Regular", 16: family, 17: "Regular"}
    for record in list(font["name"].names):
        if record.nameID in names:
            font["name"].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    font.flavor = "woff2"
    font.save(output / f"{slug}.woff2")
    credits.append({"family": family, "source": source, "upstream": url,
                    "sourceSha256": hashlib.sha256((cache / source).read_bytes()).hexdigest(),
                    "modifications": "UI glyph subset, WOFF2 conversion and family renaming; outlines unchanged.",
                    "license": (cache / license_file).read_text()})
    print(f"{family}: {(output / (slug + '.woff2')).stat().st_size} bytes")
(output / "licenses.json").write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n")
(output / "coverage.json").write_text(json.dumps({"han": "".join(sorted(han))}, ensure_ascii=False) + "\n")
