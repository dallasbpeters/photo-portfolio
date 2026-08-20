import { describe, expect, it } from "vitest";
import { batchFailureMessage } from "./useGraphRun";

/**
 * What a partly-failed batch tells you.
 *
 * "One image in the batch failed" names a number and withholds the only part
 * worth knowing — and the reasons were sitting in the array being counted. A
 * batch that half works is the case where the message matters most, because
 * there is nothing else on screen to diagnose from: the node shows the pictures
 * that did come back and says nothing about the one that did not.
 */

describe("batchFailureMessage", () => {
  it("says nothing when nothing failed", () => {
    expect(batchFailureMessage([])).toBeNull();
  });

  it("carries the reason, not just the count", () => {
    const said = batchFailureMessage([
      "the run wants picture 6 and 5 were drawn",
    ]);
    expect(said?.title).toContain("One image");
    expect(said?.description).toContain("picture 6");
  });

  it("counts the failures but lists the distinct reasons", () => {
    // Five copies of one sentence is not five pieces of information.
    const said = batchFailureMessage(["timed out", "timed out", "timed out"]);
    expect(said?.title).toContain("3 images");
    expect(said?.description).toBe("timed out");
  });

  it("shows a second reason when there genuinely is one", () => {
    const said = batchFailureMessage(["timed out", "refused"]);
    expect(said?.description).toBe("timed out · refused");
  });

  it("stops at two, so the toast stays readable", () => {
    const said = batchFailureMessage(["a", "b", "c", "d"]);
    expect(said?.description).toBe("a · b");
  });

  it("still says something when every reason was blank", () => {
    // A failure with no message is the case that produced the empty toast.
    const said = batchFailureMessage(["", "  "]);
    expect(said?.description).toBe("No reason was given.");
  });
});
