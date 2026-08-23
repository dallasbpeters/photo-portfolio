#!/usr/bin/env python3
"""
Downloads the model-lab logos fal publishes, into public/providers/.

A node header says whose model it is about to call, which needs a mark per lab.
fal's model listing (fal.ai/api/models) carries the lab *name* on every row as
`modelLab` but has no logo field. The marks come from a lab registry embedded in
each model page — objects with `name`, `slug`, `logoUrl` and `logoUrlDark`.

Each page carries only the dozen labs in its own nav, so this asks the API for
one model per lab and reads that model's page, unioning the registries. Driving
it from the API rather than a hand-written page list is what keeps it complete:
the first version hard-coded eight pages and silently missed Recraft, which the
board actually uses.

Slugs are fal's own, and config/providers.ts maps our model ids onto them rather
than deriving a slug at either end — the name inside a logo asset is a third
spelling again ("BFL" for Black Forest Labs, "krea" lowercase), so none of the
three can be computed from another.

Dark variants, because the board is dark; a lab declaring none falls back to its
light mark, and the report says which is which so a low-contrast tile can be
chased down.

Committing the files rather than fetching at runtime, deliberately: a node
header must not wait on a third-party CDN to draw, and must not tell one what is
on a board. Re-run to refresh.
"""

import json
import pathlib
import re
import sys
import urllib.request

from PIL import Image

API = "https://fal.ai/api/models?page={page}&total=100"
# `logoUrlDark` is optional and its absence is common — requiring it dropped
# six labs per page, Minimax and Pixverse among them, which is how the first
# run came back with exactly the same thirteen from every page and looked like a
# fixed feature list rather than a regex that was too strict.
LAB = re.compile(
    r'"name":"([^"]+)","slug":"([^"]+)","logoUrl":"([^"]*)"'
    r'(?:,"logoUrlDark":"([^"]*)")?'
)
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "providers"
UA = {"User-Agent": "Mozilla/5.0"}


# Twice the largest tile the panel or node header draws, so a retina screen
# still has a whole pixel per device pixel.
TILE_PX = 128


def downscale(data: bytes, target: pathlib.Path) -> bytes:
    """Writes the mark at TILE_PX, keeping its alpha. Returns what was written."""
    import io

    with Image.open(io.BytesIO(data)) as im:
        small = im.convert("RGBA")
        if max(small.size) > TILE_PX:
            small.thumbnail((TILE_PX, TILE_PX), Image.LANCZOS)
        buf = io.BytesIO()
        small.save(buf, format="PNG", optimize=True)
    target.write_bytes(buf.getvalue())
    return buf.getvalue()


def fetch(url: str, binary: bool = False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read() if binary else r.read().decode("utf-8", "replace")


def one_model_per_lab() -> dict[str, str]:
    """Lab name -> one of its model ids, so we know which page to read."""
    picked: dict[str, str] = {}
    page = 1
    while True:
        data = json.loads(fetch(API.format(page=page)))
        for item in data.get("items", []):
            lab = item.get("modelLab")
            if lab and lab not in picked:
                picked[lab] = item["id"]
        if page >= data.get("pages", 1):
            return picked
        page += 1


def labs() -> dict[str, tuple[str, str, bool]]:
    """slug -> (name, url, is_dark_variant), unioned over every lab's page."""
    found: dict[str, tuple[str, str, bool]] = {}
    for lab, model_id in sorted(one_model_per_lab().items()):
        try:
            # Escaped inside a script string, so unescape before matching.
            html = fetch(f"https://fal.ai/models/{model_id}").replace('\\"', '"')
        except Exception as err:  # noqa: BLE001 - one bad page must not stop the rest
            print(f"  ! {lab}: {err}", file=sys.stderr)
            continue
        for name, slug, light, dark in LAB.findall(html):
            if slug not in found and (dark or light):
                found[slug] = (name, dark or light, bool(dark))
    return found


def main() -> int:
    found = labs()
    if not found:
        print("No labs found — fal's page markup has changed.", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    for slug, (name, url, is_dark) in sorted(found.items()):
        try:
            data = fetch(url, binary=True)
        except Exception as err:  # noqa: BLE001
            print(f"  ! {name}: {err}", file=sys.stderr)
            continue
        # Extension from the asset, not assumed: two labs publish SVG, and
        # writing those into a .png meant a file the browser would not decode.
        ext = "svg" if url.rsplit(".", 1)[-1].lower() == "svg" else "png"
        target = OUT / f"{slug}.{ext}"
        if ext == "png":
            # 512² for a tile a few dozen pixels wide is a third of a megabyte
            # across the set. TILE_PX is generous for the largest tile at 2x.
            data = downscale(data, target)
        else:
            target.write_bytes(data)
        manifest[slug] = name
        tag = "dark" if is_dark else "LIGHT"
        size = target.stat().st_size
        print(f"  {name:20} {slug:22} {tag:5} {ext} {size:>7} B")

    print(f"\n{len(manifest)} logos in public/providers/.")
    print("Lab names, for the map in config/providers.ts:")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
