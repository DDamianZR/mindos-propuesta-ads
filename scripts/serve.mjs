// Servidor estático para desarrollo, sin dependencias.
// Los módulos ES no cargan desde file://, así que la app necesita HTTP.
// Uso: npm start  (o PORT=8080 npm start)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    const requested = normalize(join(root, decodeURIComponent(pathname)));
    if (requested !== root && !requested.startsWith(root + sep)) {
      response.writeHead(403).end('Acceso denegado');
      return;
    }
    const file = (await stat(requested)).isDirectory() ? join(requested, 'index.html') : requested;
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
});

server.listen(port, () => {
  console.log(`MindOS disponible en http://localhost:${port}`);
});
