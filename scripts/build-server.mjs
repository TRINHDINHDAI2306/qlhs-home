// Đóng gói server/index.ts (+ shared/) thành dist/Code.js cho Apps Script.
// Apps Script cần các hàm toàn cục (doGet, setup, rpc) nên ta thêm hàm "stub" gọi vào bundle.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const entry = 'server/index.ts';
const names = [...readFileSync(entry, 'utf8').matchAll(/^export function (\w+)/gm)].map(m => m[1]);

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  globalName: '__app',
  target: 'es2019',
  charset: 'utf8',
  write: false,
});

const stubs = names.map(n => `function ${n}() { return __app.${n}.apply(this, arguments); }`).join('\n');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/Code.js', `${result.outputFiles[0].text}\n${stubs}\n`);
copyFileSync('appsscript.json', 'dist/appsscript.json');
console.log(`✓ dist/Code.js (${names.join(', ')})`);
