import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_BASE_PATH || '/';
  if (!base.startsWith('/') || !base.endsWith('/') || !/^\/[\w/-]*$/.test(base))
    throw new Error('VITE_BASE_PATH must be / or /repository/');
  const api = new URL(env.VITE_API_URL || 'http://localhost:8787');
  if (!['https:', 'http:'].includes(api.protocol)) throw new Error('Invalid API URL');
  return {
    base,
    plugins: [
      react(),
      {
        name: 'water-pwa',
        transformIndexHtml(html) {
          if (command !== 'build') return html;
          const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${api.origin}; object-src 'none'; base-uri 'self'; form-action 'self'; worker-src 'self'; manifest-src 'self'`;
          return html.replace(
            '<head>',
            `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
          );
        },
        generateBundle(_, bundle) {
          const assets = [
            '',
            'index.html',
            'manifest.webmanifest',
            'icon.svg',
            'icon-192.png',
            'icon-512.png',
            ...Object.keys(bundle),
          ];
          const sw = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8');
          const revisionHash = createHash('sha256')
            .update(JSON.stringify(Object.keys(bundle)))
            .update(sw)
            .update(base)
            .update(api.origin)
            .update(readFileSync(new URL('./index.html', import.meta.url)));
          for (const file of ['icon.svg', 'icon-192.png', 'icon-512.png'])
            revisionHash.update(readFileSync(new URL('./public/' + file, import.meta.url)));
          const revision = revisionHash.digest('hex').slice(0, 16);
          this.emitFile({
            type: 'asset',
            fileName: 'manifest.webmanifest',
            source: JSON.stringify({
              id: base,
              name: 'Water Together',
              short_name: '함께 물',
              lang: 'ko',
              description: '두 사람이 함께 만드는 물 마시기 습관',
              start_url: base,
              scope: base,
              display: 'standalone',
              background_color: '#e4ebff',
              theme_color: '#e4ebff',
              icons: [
                {
                  src: `${base}icon-192.png`,
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
                {
                  src: `${base}icon-512.png`,
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            }),
          });
          this.emitFile({
            type: 'asset',
            fileName: 'sw.js',
            source: sw
              .replace('__PRECACHE__', JSON.stringify([...new Set(assets)].map((a) => base + a)))
              .replace('__REVISION__', JSON.stringify(revision)),
          });
        },
      },
    ],
  };
});
