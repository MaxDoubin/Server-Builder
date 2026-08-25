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
      // Browser shim so server/storage.ts (imported by the in-browser API) can
      // resolve Node's "crypto" module in the client build.
      crypto: path.resolve(import.meta.dirname, "client", "src", "lib", "crypto-shim.ts"),
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
          // The post archive is over a megabyte of markdown shared by four
          // routes. Give it its own chunk so those routes reference one copy
          // and nothing else has to carry it.
          if (id.includes("lib/blogPosts")) return "posts";
          // React and Vite's preload helper are needed by every route. Left
          // to Rollup they get parked in whichever chunk happens to claim
          // them, and they landed inside the r3f chunk. The entry then had
          // to statically import react-three-fiber (which statically imports
          // three) purely to reach jsx() and __vitePreload, so every visitor
          // downloaded 950KB of WebGL before the page could render, even on
          // routes with no canvas. Pin them somewhere r3f cannot absorb.
          if (
            id.includes("vite/preload-helper") ||
            id.includes("commonjsHelpers") ||
            id.includes("commonjs-dynamic-modules")
          ) {
            return "react";
          }
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react";
          }
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
