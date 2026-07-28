import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { DEV_API_PROXY_TARGET, DEV_FRONTEND_PORT, DEV_HOST } from "./dev.network.js";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: DEV_HOST,
    port: DEV_FRONTEND_PORT,
    proxy: {
      '/api': {
        target: DEV_API_PROXY_TARGET,
        changeOrigin: true,
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
