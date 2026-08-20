import "../../index.css";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardItem } from "../../types";
import type { Tool } from "../tools/types";
import { CanvasMenu } from "./CanvasMenu";

/**
 * The menu's half of the tool wiring: that the picker is reachable at all, and
 * that what it picks leaves the menu rather than being run inside it.
 *
 * Worth a test because both failures are invisible. A missing row is simply an
 * absence, and a tool that is picked but never handed up looks exactly like a
 * tool that ran and did nothing.
 */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const flush = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

afterEach(() => {
  root?.unmount();
  host?.remove();
  host = null;
  root = null;
});

const item = (extra: Partial<BoardItem> = {}): BoardItem => ({
  body: null,
  config: null,
  creditName: null,
  creditUrl: null,
  fontSize: null,
  height: 200,
  id: "a",
  imageUrl: "https://example.test/a.png",
  kind: "photo",
  nodeType: null,
  photoId: null,
  result: null,
  runError: null,
  runState: null,
  textStyle: null,
  thumbUrl: null,
  width: 200,
  x: 0,
  y: 0,
  z: 1,
  ...extra,
});

const ran: { itemId: string; toolId: string }[] = [];
const dismissed: string[] = [];

afterEach(() => {
  ran.length = 0;
  dismissed.length = 0;
});

const open = async (
  subject: BoardItem,
  onRunTool?: (picked: BoardItem, tool: Tool) => void
): Promise<HTMLElement> => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <CanvasMenu
      items={[subject]}
      menu={{ frame: null, point: { x: 10, y: 10 }, selection: [subject] }}
      onArrange={() => undefined}
      onBringToFront={() => undefined}
      onCopyFrame={() => undefined}
      onDismiss={() => dismissed.push("dismissed")}
      onExport={() => undefined}
      onGroup={() => undefined}
      onRunTool={onRunTool}
      onSaveElement={() => undefined}
      onSendToBack={() => undefined}
      wires={[]}
    />
  );
  await flush();
  return host;
};

const clickText = async (box: HTMLElement, text: string) => {
  const found = Array.from(box.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text)
  );
  if (!found) {
    throw new Error(`no button containing ${text}`);
  }
  found.click();
  await flush();
};

describe("CanvasMenu — reaching the tools", () => {
  it("offers the tools for a single selected item", async () => {
    const box = await open(item(), () => undefined);
    expect(box.textContent).toContain("Tools…");
  });

  it("offers nothing when the board cannot run one", async () => {
    // No handler means a read-only board. The row would be a dead end.
    const box = await open(item());
    expect(box.textContent).not.toContain("Tools…");
  });

  it("replaces the rows with the picker rather than opening beside them", async () => {
    const box = await open(item(), () => undefined);
    await clickText(box, "Tools…");

    expect(box.querySelector('[role="listbox"]')).not.toBeNull();
    // The rows it came from are gone, so there is one thing to dismiss.
    expect(box.textContent).not.toContain("Bring to front");
  });

  it("hands the picked tool up and closes", async () => {
    const subject = item();
    const box = await open(subject, (picked, tool) =>
      ran.push({ itemId: picked.id, toolId: tool.id })
    );
    await clickText(box, "Tools…");
    await clickText(box, "Rotate right");

    expect(ran).toEqual([{ itemId: "a", toolId: "rotate-right" }]);
    // The run outlives the menu, so the menu goes.
    expect(dismissed).toEqual(["dismissed"]);
  });

  it("does not hand up a tool the item cannot run", async () => {
    // A photo with no picture: every transform is blocked, and the picker's
    // disabled rows are the last thing between a dead run and the executor.
    const box = await open(item({ imageUrl: null }), (picked, tool) =>
      ran.push({ itemId: picked.id, toolId: tool.id })
    );
    await clickText(box, "Tools…");
    await clickText(box, "Rotate right");

    expect(ran).toEqual([]);
  });
});
