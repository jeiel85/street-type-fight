import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** 빌드 산출물(해시된 JS·CSS)을 dist/sw.js의 사전 캐시 목록과 캐시 버전에 주입한다. */
function pwaServiceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  let bundleAssets: string[] = [];

  return {
    name: 'pwa-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    generateBundle(_, bundle) {
      bundleAssets = Object.keys(bundle)
        .filter((file) => !file.endsWith('.map'))
        .sort()
        .map((file) => `./${file}`);
    },
    writeBundle() {
      const swPath = resolve(outDir, 'sw.js');
      const raw = readFileSync(swPath, 'utf8');
      const version = createHash('sha256').update(bundleAssets.join(',')).digest('hex').slice(0, 10);
      const precacheList = bundleAssets.map((u) => JSON.stringify(u)).join(',\n  ');
      const updated = raw
        .replace('__SW_VERSION__', version)
        .replace('/* __SW_PRECACHE__ */', precacheList);
      writeFileSync(swPath, updated, 'utf8');
    },
  };
}

export default defineConfig({
  // Relative base so the same build works at a GitHub Pages sub-path and locally.
  base: './',
  // three.js가 대부분인 단일 페이지 게임이라 청크를 나눠도 첫 화면에 모두 필요하다.
  build: { chunkSizeWarningLimit: 900 },
  plugins: [pwaServiceWorkerPlugin()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
