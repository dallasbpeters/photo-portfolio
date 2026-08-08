import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Same rough precedence as Vite: later files override earlier. */
export const loadEnv = (): void => {
  config({ path: join(root, ".env") });
  config({ override: true, path: join(root, ".env.local") });
  config({ override: true, path: join(root, ".env.development.local") });
};
