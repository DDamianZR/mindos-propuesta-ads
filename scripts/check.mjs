// Verificaciones estáticas sin dependencias: sintaxis, importaciones y reglas del proyecto.
// Uso: npm run check

import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const IGNORED = new Set(['.git', 'node_modules']);
const problems = [];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !IGNORED.has(entry.name))
      .map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? listFiles(path) : [path];
      }),
  );
  return files.flat();
}

const toProjectPath = (file) => relative(root, file).split(sep).join('/');
const files = await listFiles(root);
const scripts = files.filter((file) => ['.js', '.mjs'].includes(extname(file)));

// 1. Sintaxis de todos los scripts.
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) problems.push(`Sintaxis en ${toProjectPath(file)}:\n${result.stderr.trim()}`);
}

// 2. Cada módulo de src/ enlaza sus importaciones. main.js se omite porque usa el DOM al cargar.
for (const file of scripts.filter((item) => toProjectPath(item).startsWith('src/') && !item.endsWith('main.js'))) {
  try {
    await import(pathToFileURL(file).href);
  } catch (error) {
    problems.push(`Importación en ${toProjectPath(file)}: ${error.message}`);
  }
}

// 3. Reglas del proyecto.
for (const file of scripts.filter((item) => toProjectPath(item).startsWith('src/'))) {
  const source = await readFile(file, 'utf8');
  const path = toProjectPath(file);
  if (path !== 'src/ui/icons.js' && /\.innerHTML\s*=/.test(source)) {
    problems.push(`Seguridad en ${path}: no uses innerHTML; construye nodos con h() de src/ui/dom.js.`);
  }
  if (/console\.log\(/.test(source)) problems.push(`Limpieza en ${path}: quita console.log.`);
}

for (const file of files.filter((item) => extname(item) === '.css' && !item.endsWith('tokens.css'))) {
  const source = await readFile(file, 'utf8');
  const literals = source.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi);
  if (literals) {
    problems.push(`Design system en ${toProjectPath(file)}: usa tokens de styles/tokens.css en lugar de colores literales (${[...new Set(literals)].join(', ')}).`);
  }
}

if (problems.length > 0) {
  console.error(`Se encontraron ${problems.length} problema(s):\n\n${problems.join('\n\n')}`);
  process.exit(1);
}
console.log(`Todo en orden: ${scripts.length} scripts y ${files.filter((item) => extname(item) === '.css').length} hojas de estilo revisados.`);
