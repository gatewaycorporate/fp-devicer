import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.ts'],
		benchmark: {
			include: ['**/*.bench.ts'],
			outputJson: "./bench-results.json",
		},
    environment: 'node',
  },
});