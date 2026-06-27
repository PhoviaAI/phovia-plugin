import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function defaultDepsDir() {
  return process.env.PHOVIA_MCP_DEPS_DIR || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.phovia', 'mcp');
}

export function ensureDependencies(pluginRoot, depsDir = defaultDepsDir()) {
  const packageJson = path.join(pluginRoot, 'package.json');
  const lockfile = path.join(pluginRoot, 'package-lock.json');
  fs.mkdirSync(depsDir, { recursive: true, mode: 0o700 });

  const targetPackage = path.join(depsDir, 'package.json');
  const targetLock = path.join(depsDir, 'package-lock.json');
  const sdkDir = path.join(depsDir, 'node_modules', '@modelcontextprotocol', 'sdk');
  if (!sameFile(packageJson, targetPackage) || !sameFile(lockfile, targetLock) || !fs.existsSync(sdkDir)) {
    const release = acquireInstallLock(path.join(depsDir, '.install.lock'));
    try {
      if (!sameFile(packageJson, targetPackage) || !sameFile(lockfile, targetLock) || !fs.existsSync(sdkDir)) {
        fs.copyFileSync(packageJson, targetPackage);
        if (fs.existsSync(lockfile)) fs.copyFileSync(lockfile, targetLock);
        else fs.rmSync(targetLock, { force: true });
        const cmd = fs.existsSync(targetLock) ? 'ci' : 'install';
        const res = spawnSync('npm', [cmd, '--omit=dev', '--no-audit', '--no-fund', '--silent'], {
          cwd: depsDir,
          stdio: ['ignore', 'ignore', 'pipe'],
          env: process.env
        });
        if (res.status !== 0) {
          try { fs.rmSync(targetPackage, { force: true }); } catch (_) {}
          try { fs.rmSync(targetLock, { force: true }); } catch (_) {}
          const detail = res.stderr && res.stderr.length ? `: ${res.stderr.toString('utf8').trim()}` : '';
          throw new Error(`failed to install Phovia MCP dependencies${detail}`);
        }
      }
    } finally {
      release();
    }
  }
  return depsDir;
}

function acquireInstallLock(lockfile) {
  const deadline = Date.now() + 120000;
  while (true) {
    try {
      const fd = fs.openSync(lockfile, 'wx', 0o600);
      fs.writeFileSync(fd, `${process.pid}\n`);
      return () => {
        try { fs.closeSync(fd); } catch (_) {}
        try { fs.rmSync(lockfile, { force: true }); } catch (_) {}
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      removeStaleLock(lockfile);
      if (Date.now() > deadline) throw new Error('timed out waiting for Phovia MCP dependency installer lock');
      sleepSync(250);
    }
  }
}

function removeStaleLock(lockfile) {
  try {
    if (Date.now() - fs.statSync(lockfile).mtimeMs > 600000) fs.rmSync(lockfile, { force: true });
  } catch (_) {}
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sameFile(a, b) {
  try { return fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8'); }
  catch (_) { return false; }
}
