import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function phpWasmAssetUrlPlugin(): Plugin {
  return {
    name: 'php-wasm-asset-url',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        importer &&
        importer.includes('@php-wasm') &&
        /\.(wasm|dat|so|la)$/.test(source)
      ) {
        return this.resolve(source + '?url', importer, { skipSelf: true });
      }
      return null;
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [phpWasmAssetUrlPlugin(), react()],
  assetsInclude: [/\.dat$/, /\.wasm$/, /\.so$/, /\.la$/],
  optimizeDeps: {
    include: ['ini', 'wasm-feature-detect'],
    exclude: ['@php-wasm/web'],
  },
});
