import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { SettingsProvider } from "@/lib/settings";
import { startMotionEnhancer } from "@/lib/motion-enhancer";

createRoot(document.getElementById("root")!).render(
  <SettingsProvider>
    <App />
  </SettingsProvider>
);

const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 800));
idle(() => startMotionEnhancer());
