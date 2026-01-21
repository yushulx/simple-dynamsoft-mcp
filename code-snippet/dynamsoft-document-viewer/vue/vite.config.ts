import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import copy from "rollup-plugin-copy";

// https://vitejs.dev/config/
export default defineConfig({
  server:{
    open:"./index.html"
  },
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
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
