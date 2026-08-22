import { describe, expect, it } from "vitest";
import { stripJsonGuard } from "./lightroom.js";

/**
 * What can be tested without Adobe credentials — and it is the part most likely
 * to be wrong, because it is where this API differs from every other one in the
 * codebase.
 *
 * The guard prefix is real and was confirmed against the live host: an
 * unauthenticated `GET https://lr.adobe.io/v2/health` answers 403 with a body
 * that literally begins `while (1) {}` and then the JSON. It is not in the
 * getting-started documentation, and it is the first thing that breaks a new
 * client — `JSON.parse` fails on a perfectly good 200.
 */

describe("stripJsonGuard", () => {
  it("strips the guard Lightroom actually sends", () => {
    // Copied from a real response, newline and all.
    const body =
      'while (1) {}\n{\n  "code": "403000",\n  "description": "no"\n}';
    expect(JSON.parse(stripJsonGuard(body))).toEqual({
      code: "403000",
      description: "no",
    });
  });

  it("handles an array body", () => {
    expect(JSON.parse(stripJsonGuard("while (1) {}\n[1,2]"))).toEqual([1, 2]);
  });

  it("leaves clean JSON untouched", () => {
    // Not every response carries the guard, and a client that assumed it did
    // would eat the first character of the ones that do not.
    expect(stripJsonGuard('{"id":"abc"}')).toBe('{"id":"abc"}');
    expect(stripJsonGuard('[{"id":"abc"}]')).toBe('[{"id":"abc"}]');
  });

  it("returns a body with no JSON in it unchanged", () => {
    // An HTML error page from a proxy. Passed through so the caller's own
    // parse throws with the real text in the message, rather than being
    // silently turned into something else.
    expect(stripJsonGuard("<html>gateway timeout</html>")).toBe(
      "<html>gateway timeout</html>"
    );
    expect(stripJsonGuard("")).toBe("");
  });
});
