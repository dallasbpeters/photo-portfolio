import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { put } from "@vercel/blob";
import { loadEnv } from "./loadEnv.js";

/**
 * Puts a LoRA where fal can fetch it.
 *
 * fal loads weights over HTTP, so a locally trained LoRA needs a public URL
 * before it can be named in config/nodeTypes.ts. Blob storage rather than
 * public/: these files are tens of megabytes each, git keeps them forever, and
 * a weights file is not source — it is an artefact that happens to need a URL.
 *
 *   SITE=dallas-images pnpm lora:upload ./STICKER_FLUX.safetensors
 *
 * Prints the URL to paste into the model's `lora.path`. Uploading the same name
 * twice overwrites, so re-running after a retrain updates every board using it.
 */
const main = async (): Promise<void> => {
  loadEnv();

  const [source, named] = process.argv.slice(2);
  if (!source) {
    throw new Error("Usage: pnpm lora:upload <file.safetensors> [name]");
  }

  const name = named ?? basename(source);
  const bytes = await readFile(source);

  const blob = await put(`loras/${name}`, bytes, {
    access: "public",
    // Named rather than random: the URL goes into the registry by hand, and a
    // retrain should be able to replace the weights without editing code.
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });

  process.stdout.write(`${blob.url}\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
