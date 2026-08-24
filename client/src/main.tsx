// Install the in-browser API backend BEFORE anything else so that all
// /api/* fetches are served locally (no server required). Side-effect import.
import "@/lib/local-api-install";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { SettingsProvider } from "@/lib/settings";

createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
);
