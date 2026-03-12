/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { resolve } from "path";

export default defineConfig({
  plugins: [react(), svgr()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "@content": resolve(__dirname, "content"),
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-motion": ["framer-motion"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
