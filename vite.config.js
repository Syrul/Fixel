// Local dev only. Nothing here deploys.
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5177, strictPort: true },
  // The generator and the synth are frozen trees measured across four rounds.
  // They are imported, never bundled differently per-environment, and never
  // transformed — a build step that touched them would invalidate every number
  // in docs/ROUNDS.md.
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
