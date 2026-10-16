import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset} from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from "@tailwindcss/vite"
import { powerApps } from '@microsoft/power-apps-vite/plugin';
import path from "path"
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerApps(),
    babel({
      presets: [reactCompilerPreset()]
    }],
 base: 'https://github.com/JGrantLGC/BatchTimeTracker/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
})
