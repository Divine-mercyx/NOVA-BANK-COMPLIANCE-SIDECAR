import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ws: true also forwards the /api/v1/ws live-updates socket.
      "/api": { target: "http://localhost:8000", ws: true },
      "/health": "http://localhost:8000",
    },
  },
});
