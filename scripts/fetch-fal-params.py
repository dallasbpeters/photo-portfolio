#!/usr/bin/env python3
"""
Generates config/nodes/falParams.generated.ts from fal's own OpenAPI schemas.

The panel offers size, output format and quality. fal's endpoints do not agree
on any of it: Kontext and Nano Banana take `aspect_ratio` where FLUX-LoRA and
Ideogram take `image_size`; FLUX and Kontext accept only jpeg and png where Nano
Banana and GPT Image also take webp; `num_inference_steps` exists on FLUX-LoRA
but not on FLUX Pro; `quality` exists only on OpenAI's two. And fal validates
strictly — a field an endpoint has never heard of comes back 422 *after* the
request is billed.

So the allowlist cannot be written from memory, which is exactly what happened
first: a hand-written one had four errors, including sending `image_size` to a
vectoriser that takes no such thing. This reads the truth from
fal.ai/api/openapi/queue/openapi.json instead, per endpoint, and emits a table
the run path consults before putting any field in a body.

Run this after adding a model in /admin/models. It reads the endpoints from the
seed patches plus the ones the run path resolves to on its own (LoRA styles all
land on fal-ai/flux-lora, "auto" lands on nano-banana), because those never
appear as a row anybody chose.
"""

import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "config" / "nodes" / "falParams.generated.ts"
API = "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id="
UA = {"User-Agent": "Mozilla/5.0"}

# The parameters the panel can set, and nothing else — this table exists to
# answer "may I send this field", not to mirror fal's whole schema.
TRACKED = ("image_size", "aspect_ratio", "output_format", "num_inference_steps", "quality")

# Endpoints no row names, but which runs actually reach. See endpointFor in
# api/_lib/fal.ts: a LoRA resolves to flux-lora, a mask to an inpainting
# endpoint, and "auto" to one of these two depending on a wired image.
IMPLIED = {
    "fal-ai/flux-lora",
    "fal-ai/flux-lora/image-to-image",
    "fal-ai/flux-lora/inpainting",
    "fal-ai/flux-pro/kontext",
    "fal-ai/flux/dev",
    "fal-ai/flux/dev/image-to-image",
    "fal-ai/krea-2/turbo",
    "fal-ai/krea-2/turbo/image-to-image",
    "fal-ai/nano-banana-pro",
    "fal-ai/nano-banana/edit",
    "openai/gpt-image-2",
    "openai/gpt-image-2/edit",
}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def seeded_ids() -> set[str]:
    """Every endpoint the seed patches name, minus the LoRA style pseudo-ids."""
    ids: set[str] = set()
    for name in ("017_models.sql", "027_video_models.sql"):
        path = ROOT / "db" / "patches" / name
        if not path.exists():
            continue
        for match in re.finditer(r"\('([^']+)',\s*'", path.read_text()):
            ids.add(match.group(1))
    # "auto" is our own switch and "lora/…" is a style, not an endpoint.
    return {i for i in ids if i != "auto" and not i.startswith("lora/")}


def input_properties(schema: dict) -> dict:
    """The input schema's properties, merged across its Input components."""
    found: dict = {}
    for name, component in (schema.get("components", {}).get("schemas") or {}).items():
        if "Input" in name:
            found.update(component.get("properties") or {})
    return found


def enum_of(spec: dict) -> list[str]:
    """
    The allowed values, flattened.

    fal expresses these three ways: a plain `enum`, an `anyOf` holding one, and a
    `$ref` to a shared ImageSize schema whose enum is inlined beside it. All three
    appear among the endpoints this board uses.
    """
    values: list[str] = []
    for candidate in (spec.get("enum"), *(spec.get("anyOf") or [])):
        if isinstance(candidate, list):
            values += [v for v in candidate if isinstance(v, str)]
        elif isinstance(candidate, dict):
            inner = candidate.get("enum")
            if isinstance(inner, list):
                values += [v for v in inner if isinstance(v, str)]
    # "null" is how the schema spells optional, not a value anybody may pick.
    return sorted({v for v in values if v != "null"})


def main() -> int:
    endpoints = sorted(seeded_ids() | IMPLIED)
    table: dict[str, dict[str, list[str]]] = {}
    failed: list[str] = []

    for endpoint in endpoints:
        url = API + urllib.parse.quote(endpoint, safe="/")
        try:
            properties = input_properties(fetch(url))
        except Exception as err:  # noqa: BLE001 - one dead endpoint must not stop the rest
            failed.append(f"{endpoint}: {err}")
            continue
        accepted = {
            field: enum_of(properties[field])
            for field in TRACKED
            if field in properties
        }
        if accepted:
            table[endpoint] = accepted
        print(f"  {endpoint:48} {sorted(accepted) or '—'}")

    if not table:
        print("No schemas read — fal's OpenAPI route has changed.", file=sys.stderr)
        return 1

    body = json.dumps(table, indent=2, sort_keys=True)
    OUT.write_text(f'''/**
 * What each fal endpoint will accept, read from fal's own OpenAPI schemas.
 *
 * GENERATED by scripts/fetch-fal-params.py. Do not edit by hand — re-run the
 * script after adding a model in /admin/models.
 *
 * This exists because fal validates strictly and bills first: a field an
 * endpoint has never heard of comes back 422 on a request that has already been
 * paid for. The panel offers size, output format and quality; which of those an
 * endpoint takes, under which name, and with which values, differs per endpoint
 * in ways that are not guessable — Kontext takes `aspect_ratio` where Ideogram
 * takes `image_size`, FLUX accepts only jpeg and png where Nano Banana also
 * takes webp, and a vectoriser takes none of it.
 *
 * A hand-written version of this table had four errors. This one is read from
 * the source.
 *
 * An endpoint absent from this table accepts none of these parameters, which is
 * the safe reading: applyParams sends nothing it cannot find here.
 */

/** Field name to the values that field allows. */
export type FalParamSupport = Readonly<Record<string, readonly string[]>>;

export const FAL_PARAM_SUPPORT: Readonly<Record<string, FalParamSupport>> =
  {body} as const;
''')
    print(f"\n{len(table)} endpoints -> {OUT.relative_to(ROOT)}")
    for line in failed:
        print(f"  ! {line}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
