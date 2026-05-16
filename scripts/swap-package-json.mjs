#!/usr/bin/env node
// Swap the active package.json between two committed source-of-truth files:
//   - package.build.json    (used during local dev/build; workspace:* on internal peers)
//   - package.publish.json  (used for npm publish; concrete semver on internal peers)
//
// Wired into per-package lifecycle hooks (prebuild / prepublishOnly / postpublish)
// so the right one is active automatically. Safe to invoke manually too:
//
//   node ../../scripts/swap-package-json.mjs build
//   node ../../scripts/swap-package-json.mjs publish
//
// Operates on the current working directory, so each package invokes it from its
// own dir (cwd is the package root when pnpm runs a script).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const VALID_MODES = new Set(['build', 'publish']);

const mode = process.argv[2];
if (!VALID_MODES.has(mode)) {
  console.error(
    `Usage: node ../../scripts/swap-package-json.mjs <build|publish>\n  got: ${
      process.argv.slice(2).join(' ') || '(no args)'
    }`,
  );
  process.exit(1);
}

const cwd = process.cwd();
const source = path.join(cwd, `package.${mode}.json`);
const target = path.join(cwd, 'package.json');

if (!existsSync(source)) {
  console.error(`[swap-package-json] source not found: ${source}`);
  console.error('  Are you running this from the package directory?');
  process.exit(1);
}

// Sanity check: the source must parse as JSON and have a "name" field, so we
// don't quietly clobber package.json with a broken file.
const content = readFileSync(source, 'utf8');
let parsed;
try {
  parsed = JSON.parse(content);
} catch (err) {
  console.error(`[swap-package-json] ${source} is not valid JSON: ${err}`);
  process.exit(1);
}
if (typeof parsed.name !== 'string') {
  console.error(`[swap-package-json] ${source} is missing a "name" field`);
  process.exit(1);
}

// Preserve the source file's exact byte content so existing formatting
// (biome / prettier / hand-tweaks) survives the swap. The validation above
// ensures we're not writing a broken file.
writeFileSync(target, content);

const rel = path.relative(process.cwd(), source);
console.log(`[swap-package-json] ${parsed.name}: package.json <- ${rel}`);
