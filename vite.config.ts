import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';

// Serve/copy repo-root data/ (the append-only JSONL observations) and
// results/ (CI-generated validation report) into the static site without
// moving them into public/ — they are canonical repo content, not assets.
function copyRepoData(): Plugin {
  return {
    name: 'copy-repo-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]!;
        if (url.startsWith('/data/') || url.startsWith('/results/')) {
          const file = resolve(import.meta.dirname, '.' + url);
          if (existsSync(file)) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            import('node:fs').then((fs) => fs.createReadStream(file).pipe(res));
            return;
          }
        }
        next();
      });
    },
    closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');
      if (!existsSync(dist)) return;
      for (const dir of ['data', 'results']) {
        const src = resolve(import.meta.dirname, dir);
        if (existsSync(src)) {
          mkdirSync(resolve(dist, dir), { recursive: true });
          cpSync(src, resolve(dist, dir), { recursive: true });
        }
      }
    },
  };
}

export default defineConfig({
  // Relative base so the site works at any GitHub Pages path (and later GCP).
  base: './',
  plugins: [copyRepoData()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        sweep: resolve(import.meta.dirname, 'sweep.html'),
        capture: resolve(import.meta.dirname, 'capture.html'),
        data: resolve(import.meta.dirname, 'data.html'),
        validate: resolve(import.meta.dirname, 'validate.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
