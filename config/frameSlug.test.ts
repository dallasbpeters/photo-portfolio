import { describe, expect, it } from "vitest";
import { frameForSlug, frameSlugs, slugifyName } from "./frameSlug.js";

/**
 * A slug is a shared link. The property that matters is that one keeps working:
 * naming a second frame the same thing tomorrow must not silently repoint a URL
 * somebody sent today.
 */

const frame = (id: string, name: string | null) => ({ id, name });

describe("slugifyName", () => {
  it("makes a readable segment", () => {
    expect(slugifyName("Deck Mockups")).toBe("deck-mockups");
    expect(slugifyName("  Logo Studies — v2  ")).toBe("logo-studies-v2");
    expect(slugifyName("2026 / Q3 Campaign")).toBe("2026-q3-campaign");
  });

  it("leaves no dash stranded at either end", () => {
    expect(slugifyName("!!! hello !!!")).toBe("hello");
    expect(slugifyName("---")).toBe("");
  });

  it("is empty for a name with nothing sluggable in it", () => {
    // The caller substitutes the id; a frame with no usable name still needs an
    // address.
    expect(slugifyName("")).toBe("");
    expect(slugifyName("   ")).toBe("");
    expect(slugifyName("日本語")).toBe("");
  });

  it("does not end a truncated slug on a dash", () => {
    const long = `${"a".repeat(47)} tail`;
    const slug = slugifyName(long);
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("frameSlugs", () => {
  it("gives each frame its name", () => {
    const slugs = frameSlugs([
      frame("aaaaaaaa-1111-1111-1111-111111111111", "Deck Mockups"),
      frame("bbbbbbbb-2222-2222-2222-222222222222", "Logo Studies"),
    ]);
    expect([...slugs.values()]).toEqual(["deck-mockups", "logo-studies"]);
  });

  it("lets the first frame keep the clean slug", () => {
    /*
     * The property a shared link depends on. Naming a second frame "Mockups"
     * tomorrow must not steal the address the first one was shared under — so
     * the newcomer gets the uglier slug, not the incumbent.
     */
    const slugs = frameSlugs([
      frame("aaaaaaaa-1111-1111-1111-111111111111", "Mockups"),
      frame("bbbbbbbb-2222-2222-2222-222222222222", "Mockups"),
    ]);
    expect(slugs.get("aaaaaaaa-1111-1111-1111-111111111111")).toBe("mockups");
    expect(slugs.get("bbbbbbbb-2222-2222-2222-222222222222")).toBe(
      "mockups-bbbbbbbb"
    );
  });

  it("addresses an unnamed frame by id, not by position", () => {
    // "frame-2" would move every link the moment a frame was inserted above it.
    const slugs = frameSlugs([
      frame("aaaaaaaa-1111-1111-1111-111111111111", null),
      frame("bbbbbbbb-2222-2222-2222-222222222222", ""),
    ]);
    expect([...slugs.values()]).toEqual(["aaaaaaaa", "bbbbbbbb"]);
  });

  it("never repeats a slug, whatever the names are", () => {
    const frames = [
      frame("aaaaaaaa-1111-1111-1111-111111111111", "Same"),
      frame("bbbbbbbb-2222-2222-2222-222222222222", "Same"),
      frame("cccccccc-3333-3333-3333-333333333333", "Same"),
      frame("dddddddd-4444-4444-4444-444444444444", null),
      // A name that is already another frame's short id.
      frame("eeeeeeee-5555-5555-5555-555555555555", "dddddddd"),
    ];
    const slugs = [...frameSlugs(frames).values()];
    expect(new Set(slugs).size).toBe(frames.length);
  });
});

describe("frameForSlug", () => {
  const frames = [
    frame("aaaaaaaa-1111-1111-1111-111111111111", "Deck Mockups"),
    frame("bbbbbbbb-2222-2222-2222-222222222222", null),
  ];

  it("finds a frame by its slug", () => {
    expect(frameForSlug(frames, "deck-mockups")?.name).toBe("Deck Mockups");
    expect(frameForSlug(frames, "DECK-MOCKUPS")?.name).toBe("Deck Mockups");
  });

  it("accepts a full id or a short one", () => {
    // What an older link or a copied selection is likely to carry. Refusing it
    // would be refusing something that unambiguously names a frame.
    expect(
      frameForSlug(frames, "aaaaaaaa-1111-1111-1111-111111111111")?.name
    ).toBe("Deck Mockups");
    expect(frameForSlug(frames, "bbbbbbbb")?.id).toBe(
      "bbbbbbbb-2222-2222-2222-222222222222"
    );
  });

  it("is null for a slug that names nothing", () => {
    expect(frameForSlug(frames, "not-a-frame")).toBeNull();
    expect(frameForSlug(frames, "")).toBeNull();
    expect(frameForSlug([], "deck-mockups")).toBeNull();
  });
});
