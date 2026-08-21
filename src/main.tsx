import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./lib/posthog.ts";
/*
 * The stylesheet before the app, and the order is load-bearing.
 *
 * index.css carries the tokens and the shared primitives. A component's
 * co-located stylesheet is bundled at the point its module is imported, so with
 * App first every eagerly-imported page's CSS landed *ahead* of the primitives
 * — and at equal specificity the primitive won. A block class that set a gap or
 * a size lost it silently to `.stack` or `.label`, which is the one failure this
 * whole arrangement has to not have. Lazy routes escaped it by arriving in a
 * later chunk, so it broke exactly one page and looked like that page's fault.
 */
import "./index.css";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/registerServiceWorker";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element — index.html did not load correctly.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
