import { describe, expect, it } from "vitest";
import { videoUrlOf } from "./falQueue.js";

/**
 * Reading a finished job's payload.
 *
 * This is the part that fails silently and expensively: a video that generated
 * correctly, was billed in full, and is then read as "no output" because the
 * endpoint answered `videos: [...]` where the last one answered `video: {...}`.
 * Nothing throws — the node simply comes back empty.
 */
describe("videoUrlOf", () => {
  const URL = "https://fal.media/files/x/out.mp4";

  it("reads the singular shape", () => {
    expect(videoUrlOf({ video: { url: URL } })).toBe(URL);
  });

  it("reads the plural shape", () => {
    expect(videoUrlOf({ videos: [{ url: URL }] })).toBe(URL);
  });

  it("reads a bare url", () => {
    expect(videoUrlOf({ url: URL })).toBe(URL);
  });

  it("reads an output list", () => {
    expect(videoUrlOf({ output: [{ url: URL }] })).toBe(URL);
  });

  it("reads a single output object", () => {
    expect(videoUrlOf({ output: { url: URL } })).toBe(URL);
  });

  it("trims, because a padded address is not a different address", () => {
    expect(videoUrlOf({ video: { url: `  ${URL} ` } })).toBe(URL);
  });

  it("is null when there is genuinely nothing", () => {
    expect(videoUrlOf({})).toBeNull();
    expect(videoUrlOf({ video: {} })).toBeNull();
    expect(videoUrlOf({ videos: [] })).toBeNull();
  });

  it("ignores a non-string url rather than returning it", () => {
    // A number here would become "undefined" or "[object Object]" downstream
    // and be forwarded as an address, which fails much further from the cause.
    expect(videoUrlOf({ video: { url: 42 } })).toBeNull();
  });

  it("prefers the first shape that actually carries an address", () => {
    expect(videoUrlOf({ video: {}, videos: [{ url: URL }] })).toBe(URL);
  });
});
