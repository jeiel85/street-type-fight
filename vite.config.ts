import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the same build works at a GitHub Pages sub-path and locally.
  base: './',
  // three.js가 대부분인 단일 페이지 게임이라 청크를 나눠도 첫 화면에 모두 필요하다.
  build: { chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
