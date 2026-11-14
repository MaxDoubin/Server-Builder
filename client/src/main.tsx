// Install the in-browser API backend BEFORE anything else so that all
// /api/* fetches are served locally (no server required). Side-effect import.
import "@/lib/local-api-install";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "@/lib/registerServiceWorker";
import { applyDeferredFonts } from "@/lib/applyDeferredFonts";

// Before render: the CSP forbids the inline onload that used to do this, and
// nothing else will take the font stylesheet off media="print".
applyDeferredFonts();

createRoot(document.getElementById("root")!).render(<App />);

// After render, so it never competes with first paint. Navigations stay
// network-first inside the worker: caching HTML would pin a stale document
// to asset filenames that no longer exist after a redeploy.
registerServiceWorker();
