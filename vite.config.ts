import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { DEV_API_URL, DEV_FRONTEND_PORT, DEV_HOST } from "./dev.network.js";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: DEV_HOST,
    port: DEV_FRONTEND_PORT,
    proxy: {
      '/api': {
        target: DEV_API_URL,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
