import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin dashboard dev server. Runs on port 5173 (allowed by the Express CORS
// dev allowlist in server/index.ts) and proxies /api to the local API server so
// the dashboard and API share an origin in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
