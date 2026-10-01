import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite"
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import path from "path"
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerApps(),
    ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
})
