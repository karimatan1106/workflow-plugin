import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'mcp-server/src/**/*.test.ts',
      'mcp-server/tests/**/*.test.ts',
    ],
    exclude: [
      'mcp-server/dist/**',
      'node_modules/**',
    ],
  },
});
