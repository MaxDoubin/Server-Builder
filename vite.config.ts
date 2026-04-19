import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Raise the chunk-size warning bar: we intentionally split big
    // deps below, and the remaining splits are each reasonable.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Keep the critical-path chunk tiny by pushing heavy, rarely
        // co-used dependencies into dedicated chunks. Browsers fetch
        // these in parallel; the route that needs them triggers the
        // load and the rest of the shell renders immediately.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("three") && !id.includes("@react-three")) {
            return "three";
          }
          if (id.includes("@react-three")) return "r3f";
          if (id.includes("gsap") || id.includes("lenis")) return "motion";
          if (id.includes("marked")) return "marked";
          if (id.includes("lucide-react")) return "icons";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
