import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the API is proxied to the FastAPI container (or localhost:8000).
const target = process.env.API_TARGET ?? "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, allowedHosts: true, proxy: { "/api": { target, changeOrigin: false } } },
  build: { outDir: "dist", sourcemap: false },
});
