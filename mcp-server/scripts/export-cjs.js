#!/usr/bin/env node
/**
 * ESM形式のdefinitions.jsをCJS形式に変換するスクリプト
 *
 * tsc でコンパイルされた dist/phases/definitions.js (ESM) を
 * dist/phase-definitions.cjs (CommonJS) に変換する。
 * hooks側のphase-definitions.jsがCJS参照できるようにする。
 *
 * @spec docs/workflows/ワ-クフロ-プラグイン構造的問題9件の根本原因修正/spec.md REQ-E
 */
const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '..', 'dist', 'phases', 'definitions.js');
const outputPath = path.join(__dirname, '..', 'dist', 'phase-definitions.cjs');

if (!fs.existsSync(inputPath)) {
  console.error('Error: dist/phases/definitions.js not found. Run tsc first.');
  process.exit(1);
}

const content = fs.readFileSync(inputPath, 'utf8');

// ESM export を CJS module.exports に変換
let cjsContent = content
  .replace(/^export\s+/gm, '')
  .replace(/^import\s+.*$/gm, '');

// module.exports を追加
// PHASES, PHASE_DESCRIPTIONS 等の名前付きエクスポートを検出
const exportNames = [];
const constMatches = content.matchAll(/export\s+const\s+(\w+)/g);
for (const match of constMatches) {
  exportNames.push(match[1]);
}
const functionMatches = content.matchAll(/export\s+function\s+(\w+)/g);
for (const match of functionMatches) {
  exportNames.push(match[1]);
}

if (exportNames.length > 0) {
  cjsContent += '\nmodule.exports = { ' + exportNames.join(', ') + ' };\n';
}

fs.writeFileSync(outputPath, cjsContent, 'utf8');
console.log('Generated:', outputPath);
