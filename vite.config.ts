import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const APP_VERSION = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

export default defineConfig(({ mode }) => ({
  server: { host: "::", port: 8080 },
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, "/");
          if (!modulePath.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(modulePath)) {
            return "vendor-react";
          }
          if (modulePath.includes("/node_modules/@supabase/")) return "vendor-supabase";
          if (modulePath.includes("/node_modules/@tanstack/react-query/")) return "vendor-query";
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
}));
