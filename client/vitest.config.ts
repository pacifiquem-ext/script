import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@script/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    environment: 'jsdom',
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      all: false,
      // Unit surface: pure libs + design-system UI (pages/layouts stay integration-level).
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/components/ui/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/test/**',
        'src/lib/icons.tsx',
        'src/lib/workflows-api.ts',
        'src/lib/integrations-api.ts',
        'src/lib/mask-secrets.ts',
        'src/lib/library-api.ts',
        'src/lib/textarea-caret.ts',
        'src/lib/use-resizable-width.ts',
        'src/components/ui/BrandIcons.tsx',
        'src/components/ui/MarkdownContent.tsx',
        'src/components/ui/ResizeHandle.tsx',
        'src/components/ui/SideDrawer.tsx',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 75,
        statements: 90,
      },
    },
  },
});
