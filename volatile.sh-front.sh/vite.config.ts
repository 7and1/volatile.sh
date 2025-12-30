import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      proxy: {
        "/api": "http://localhost:8787",
      },
    },
    plugins: [react()],
    base: "/",
    build: {
      outDir: path.resolve(__dirname, "../dist"),
      emptyOutDir: true,
      // P0 Performance Fix: Use esbuild for minification (faster, built-in)
      minify: "esbuild",
      // P0 Performance Fix: Manual chunks for better caching and code splitting
      rollupOptions: {
        output: {
          manualChunks: {
            // Vendor chunk for React and related libraries
            vendor: ["react", "react-dom"],
            // UI components chunk
            ui: ["lucide-react"],
          },
        },
      },
      // Disable source maps for smaller production builds
      sourcemap: false,
      // Target modern browsers for smaller bundles
      target: "es2020",
    },
    // P0 Performance Fix: esbuild minification options
    esbuild: {
      drop: ["console", "debugger"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
  };
});
