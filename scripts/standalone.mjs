// Junta o app compilado (dist/) em UM único arquivo HTML, com CSS e JavaScript embutidos.
// Assim o app abre direto no navegador, sem servidor e sem internet.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const OUT_DIR = 'dist-standalone';
const OUT_FILE = join(OUT_DIR, 'Meu-Quadro-de-Estudos.html');

const readAsset = (href) => readFileSync(join(DIST, href.replace(/^\//, '')), 'utf8');

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Remove preloads de módulos (não são necessários quando tudo já está embutido)
html = html.replace(/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g, '');

// CSS: <link rel="stylesheet" href="/assets/x.css"> -> <style>...</style>
html = html.replace(/<link\b[^>]*>/g, (tag) => {
  if (!/rel="stylesheet"/.test(tag)) return tag;
  const href = tag.match(/href="([^"]+)"/)[1];
  return `<style>${readAsset(href)}</style>`;
});

// JS: <script type="module" src="/assets/x.js"></script> -> <script type="module">...</script>
let scriptCount = 0;
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
  scriptCount++;
  const js = readAsset(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});

if (scriptCount !== 1) {
  throw new Error(`Esperava 1 bundle JavaScript, encontrei ${scriptCount}. Verifique o build.`);
}
if (/src="\/assets|href="\/assets/.test(html)) {
  throw new Error('Ainda há referências a arquivos externos em /assets.');
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, html, 'utf8');
console.log(`Arquivo gerado: ${OUT_FILE} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
