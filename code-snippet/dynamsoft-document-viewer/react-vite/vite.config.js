import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import copy from "rollup-plugin-copy";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    copy({
      targets: [
        {
          src: "node_modules/dynamsoft-document-viewer/dist",
          dest: "public/dynamsoft-document-viewer",
        },
      ],
      hook: "buildStart",
    }),
    react()
  ],
})
