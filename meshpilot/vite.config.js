import { defineConfig } from 'vite';

// Built into the POLYMODEL-Vault site and served from /meshpilot/ (see ../scripts/build_meshpilot.sh).
export default defineConfig({
  base: '/meshpilot/',
  build: {
    outDir: '../public/meshpilot',
    emptyOutDir: true,
  },
});
