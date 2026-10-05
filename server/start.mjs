import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './store.mjs';
import { apiMiddleware } from './api.mjs';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const server = http.createServer((req, res) =>
  apiMiddleware(req, res, async () => {
    try {
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host || '')) {
        res.writeHead(403);
        return res.end('Local access only');
      }
      const url = new URL(req.url, 'http://localhost');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || !path.extname(rel)) rel = '/index.html';
      const base = path.resolve(ROOT, 'dist'),
        file = path.resolve(base, '.' + rel);
      if (!file.startsWith(base + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
      const bytes = await fs.readFile(file);
      res.setHeader(
        'Content-Type',
        mime[path.extname(file)] || 'application/octet-stream',
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end('Not found. Run npm run build first.');
    }
  }),
);
server.listen(Number(process.env.PORT || 4317), '127.0.0.1', () =>
  console.log('Life OS: http://127.0.0.1:' + (process.env.PORT || 4317)),
);
