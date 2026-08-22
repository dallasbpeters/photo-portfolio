import type { NodeType } from "../nodeTypes.js";
import { OUTPUT_PORT_KEY } from "../ports.js";

/**
 * A brand kit, on the board.
 *
 * The door the kit was missing. A kit is a governing document — palette, voice,
 * typefaces, a look — and until this existed it governed nothing: it could be
 * written in /admin/brand-kits and there was no way to spend it on a
 * generation. `kitPromptText` had been sitting in config/brandKit.ts with no
 * caller.
 *
 * Built exactly like the Element node, which had the same problem and the same
 * answer. It stores only an id; the palette and the voice belong to the library,
 * so correcting a brand in one place corrects every board that draws on it.
 * That is the difference between a library and a stamp. The resolution happens
 * once before the graph is walked — see withBrandKits — so `singleOutputOf`
 * finds plain words on the row and nothing downstream has to know a kit was
 * involved.
 *
 * One wire, one job: it hands over the brand as prompt text, which travels into
 * a Generate node's prompt input alongside whatever else feeds it. A Generate
 * node's prompt port is `arity: "many"` and joins its wires, which is what lets
 * a brand and a subject arrive at once without either replacing the other.
 *
 * No capability, so it never runs and never costs anything. Its value is what
 * the library says today.
 */
export const BRAND: NodeType = {
  id: "brand",
  inputs: [],
  label: "Brand",
  outputs: [{ key: OUTPUT_PORT_KEY, label: "Brand", type: "text" }],
  settings: [
    {
      /*
       * Which kit, chosen from the library rather than typed.
       *
       * Data, like the model picker above it: the choices are rows in
       * `brand_kits`, edited in the admin, so the registry declares the control
       * and the control asks for what to offer. Empty by default because there
       * is no sensible default brand — a node that silently picked the first kit
       * in the library would put someone else's brand on a board.
       */
      default: "",
      key: "brandKitId",
      kind: "brandKit",
      label: "Brand kit",
    },
  ],
};
