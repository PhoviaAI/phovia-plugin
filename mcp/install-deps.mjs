#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDependencies } from './deps.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  ensureDependencies(pluginRoot);
} catch (err) {
  console.error(`Phovia MCP dependency setup will retry later: ${err.message || String(err)}`);
}
