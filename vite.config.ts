import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Strip the `crossorigin` attribute Vite adds to <script>/<link> tags.
// The app bundle is same-origin; with `crossorigin` the browser fetches it in
// CORS mode, which our API CORS allowlist then rejects on any non-allowlisted
// origin (e.g. *.onrender.com) → module fails to execute → blank page.
const stripCrossorigin = {
  name: "strip-crossorigin",
  transformIndexHtml(html: string) {
    return html.replace(/\s+crossorigin/g, "");
  },
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), stripCrossorigin],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
