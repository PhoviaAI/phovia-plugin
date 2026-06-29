'use strict';

// Vendored mirror of brain's request schemas for the insight ingest/recall
// endpoints (brain's `insightIngestRequestSchema` / `insightRecallRequestSchema`,
// authored there with zod). This is the guardrail from the contract-drift
// post-mortem: the plugin test validates its OUTGOING request bodies against
// these schemas so that if the plugin's payload stops matching what brain
// accepts (e.g. reverting to the legacy `transcript_tail` ingest shape), the
// test turns RED instead of staying green against a permissive mock.
//
// Keeping this in sync:
//   - Keep this file aligned with brain's zod schemas, OR
//   - Regenerate from brain's published OpenAPI document (`GET /openapi.json`).
// The validator below is intentionally dependency-free (no zod) so the plugin
// test suite stays self-contained. The shapes — not zod itself — are the
// contract being enforced.
//
// Schemas are STRICT: unknown top-level keys are rejected, mirroring brain
// returning HTTP 400 for the legacy payload shape (see #11). Field-level value
// assertions (exact agent_type / mode / message contents) live in the test
// itself; this module enforces structure.

function kind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function string(opts = {}) {
  const min = opts.min || 0;
  return {
    optional: Boolean(opts.optional),
    check(value, path) {
      if (typeof value !== 'string') return [`${path}: expected string, got ${kind(value)}`];
      if (value.length < min) return [`${path}: expected string length >= ${min}, got ${value.length}`];
      return [];
    }
  };
}

function enumOf(values, opts = {}) {
  return {
    optional: Boolean(opts.optional),
    check(value, path) {
      if (typeof value !== 'string') return [`${path}: expected enum string, got ${kind(value)}`];
      if (!values.includes(value)) return [`${path}: ${JSON.stringify(value)} not in {${values.join(', ')}}`];
      return [];
    }
  };
}

function array(item, opts = {}) {
  const min = opts.min || 0;
  return {
    optional: Boolean(opts.optional),
    check(value, path) {
      if (!Array.isArray(value)) return [`${path}: expected array, got ${kind(value)}`];
      if (value.length < min) return [`${path}: expected array length >= ${min}, got ${value.length}`];
      const errors = [];
      value.forEach((element, i) => { errors.push(...item.check(element, `${path}[${i}]`)); });
      return errors;
    }
  };
}

function object(shape, opts = {}) {
  const strict = opts.strict !== false;
  return {
    optional: Boolean(opts.optional),
    check(value, path) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return [`${path || '<root>'}: expected object, got ${kind(value)}`];
      }
      const errors = [];
      const prefix = path ? `${path}.` : '';
      for (const key of Object.keys(shape)) {
        const field = shape[key];
        const present = Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
        if (!present) {
          if (!field.optional) errors.push(`${prefix}${key}: required field missing`);
          continue;
        }
        errors.push(...field.check(value[key], `${prefix}${key}`));
      }
      if (strict) {
        for (const key of Object.keys(value)) {
          if (!Object.prototype.hasOwnProperty.call(shape, key)) {
            errors.push(`${prefix}${key}: unknown key not allowed by schema`);
          }
        }
      }
      return errors;
    }
  };
}

function optional(type) {
  return Object.assign({}, type, { optional: true });
}

// brain: insightIngestRequestSchema — one conversation turn (or more) plus the
// agent/session/device identity the backend needs to attribute the observation.
const insightIngestRequestSchema = object({
  messages: array(object({
    role: enumOf(['user', 'assistant', 'system']),
    content: string({ min: 1 })
  }), { min: 1 }),
  device_id: string({ min: 1 }),
  agent_type: string({ min: 1 }),
  agent_id: string({ min: 1 }),
  session_id: string({ min: 1 }),
  mode: string({ min: 1 })
});

// brain: insightRecallRequestSchema — recall context for a hook event. session
// metadata is optional (login-time recall omits it).
const insightRecallRequestSchema = object({
  client: string({ min: 1 }),
  event: string({ min: 1 }),
  session_id: optional(string()),
  cwd: optional(string()),
  source: optional(string()),
  model: optional(string())
});

function validate(schema, value) {
  return schema.check(value, '');
}

module.exports = {
  insightIngestRequestSchema,
  insightRecallRequestSchema,
  validate
};
