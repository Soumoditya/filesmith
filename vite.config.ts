import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "Filesmith — free file tools",
        short_name: "Filesmith",
        description:
          "Edit, convert, create and clean up documents, images and media — free, with no uploads.",
        theme_color: "#dd5c15",
        background_color: "#fbfaf9",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Tool chunks and WASM payloads are large but immutable, so caching
        // them is what makes the site work offline after a single visit.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
  build: {
    // Heavy per-tool chunks are the whole point of the architecture; the
    // default warning threshold is just noise here.
    chunkSizeWarningLimit: 1500,
  },
  worker: {
    format: "es",
  },
});
