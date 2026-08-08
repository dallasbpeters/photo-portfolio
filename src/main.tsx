import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./lib/posthog.ts";
import App from "./App.tsx";
import "./index.css";
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
