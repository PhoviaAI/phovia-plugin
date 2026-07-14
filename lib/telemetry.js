'use strict';

// Dependency-free because hooks must work before MCP dependencies are installed.
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const TIMEOUT_MS = 1500;
const TEXT_MAX = 500;

function detectHost(env = process.env) {
  if (Object.keys(env).some(key => key.startsWith('CODEX_'))) return 'codex-desktop';
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return 'claude-code';
  return 'unknown';
}

function scrubText(value, max = TEXT_MAX) {
  let text = String(value == null ? '' : value);
  text = text
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/["']?\b(?:access_token|refresh_token|user_code|device_code)\b["']?\s*[:=]\s*["']?[^\s,;}"']+["']?/gi, '[redacted]')
    .replace(/\b(?:access_token|refresh_token|user_code|device_code)\b/gi, '[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/(?:auth\.json|search\s+query|message\s+(?:body|content)|memory\s+content)\s*[:=]?\s*[^\n]*/gi, '[redacted]');
  return text.slice(0, max);
}

function safeStack(error) {
  const frames = [];
  for (const line of String(error && error.stack || '').split('\n').slice(1, 16)) {
    const match = line.match(/(?:\(|at\s+)([^()\s]+):(\d+):(\d+)\)?\s*$/);
    if (match) frames.push({ filename: scrubText(match[1].split(/[\\/]/).pop(), 150), lineno: Number(match[2]), colno: Number(match[3]) });
  }
  return frames;
}

function parseDsn(raw) {
  try {
    const dsn = new URL(raw);
    const parts = dsn.pathname.split('/').filter(Boolean);
    const project = parts.pop();
    if (!/^https?:$/.test(dsn.protocol) || !dsn.username || !project) return null;
    const prefix = parts.length ? `/${parts.join('/')}` : '';
    return {
      url: `${dsn.protocol}//${dsn.host}${prefix}/api/${project}/envelope/`,
      auth: `Sentry sentry_version=7,sentry_key=${dsn.username}`
    };
  } catch (_) { return null; }
}

function createEnvelope(error, context = {}, dsn = process.env.PHOVIA_SENTRY_DSN) {
  const target = parseDsn(dsn);
  if (!target) return null;
  const eventId = crypto.randomBytes(16).toString('hex');
  const event = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    level: 'error',
    exception: { values: [{
      type: scrubText(error && error.name || 'Error', 100),
      value: scrubText(error && error.message || error || 'Unknown error'),
      stacktrace: { frames: safeStack(error) }
    }] },
    tags: {
      event: scrubText(context.event || 'unknown', 100),
      host: scrubText(context.host || detectHost(), 30)
    }
  };
  if (Number.isFinite(Number(context.status))) event.tags.status = String(Number(context.status));
  const body = JSON.stringify(event);
  return {
    target,
    body: `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: 'event', length: Buffer.byteLength(body) })}\n${body}`
  };
}

function reportError(error, context = {}) {
  if (/^(1|true|yes|on)$/i.test(process.env.PHOVIA_SENTRY_DISABLED || '')) return Promise.resolve(false);
  const envelope = createEnvelope(error, context);
  if (!envelope) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const done = value => {
      if (!settled) {
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(value);
      }
    };
    try {
      const url = new URL(envelope.target.url);
      const req = (url.protocol === 'http:' ? http : https).request({
        method: 'POST', hostname: url.hostname, port: url.port, path: url.pathname,
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/x-sentry-envelope', 'Content-Length': Buffer.byteLength(envelope.body), 'X-Sentry-Auth': envelope.target.auth }
      }, res => { res.resume(); res.on('end', () => done(true)); });
      req.on('timeout', () => req.destroy());
      req.on('error', () => done(false));
      req.end(envelope.body);
      timer = setTimeout(() => { req.destroy(); done(false); }, TIMEOUT_MS);
    } catch (_) { done(false); }
  });
}

module.exports = { TIMEOUT_MS, createEnvelope, detectHost, reportError, scrubText };
