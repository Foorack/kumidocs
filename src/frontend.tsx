// Force Bun's dev bundler to resolve khroma's ESM re-export chain before
// mermaid's internal chunks try to import from it. Without this, the dev
// HMR bundler creates an empty synthetic module for khroma, causing:
//   TypeError: import_khroma5.adjust is not a function
// oxlint-disable-next-line import/no-duplicates, import/no-unassigned-import
import "khroma";
// Named import variant: some bundler versions need this to trigger proper
// ESM re-export tracing through khroma's chain (khroma -> methods -> adjust).
// oxlint-disable-next-line @typescript-eslint/no-unused-vars, import/no-duplicates
import "./index.css";
import App from "./app";
import { StrictMode } from "react";
import { adjust as _khromaAdjust } from "khroma";
import { createRoot } from "react-dom/client";
import { registerMermaidIcons } from "@/lib/register-mermaid-icons";

const elemOrNull = document.querySelector("#root");
if (!elemOrNull) {
  throw new Error("Root element #root not found in document");
}
const elem = elemOrNull;

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Kick off lazy icon pack loading before React renders.
void registerMermaidIcons();

// Import.meta.hot is available in Bun dev (HMR) mode; undefined after production bundling
// Bun requires direct access to import.meta.hot.data: no aliasing
interface HotData {
  root?: ReturnType<typeof createRoot>;
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Bun types import.meta.hot as always-truthy but it is undefined after production bundling
// oxlint-disable-next-line typescript/no-unnecessary-condition
if (import.meta.hot === undefined) {
  createRoot(elem).render(app);
} else {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const data = import.meta.hot.data as HotData;
  const root = (data.root ??= createRoot(elem));
  root.render(app);
}
