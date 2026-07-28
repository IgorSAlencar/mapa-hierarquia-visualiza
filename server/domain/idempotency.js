import crypto from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function idempotencyRequestHash({ method, path, body }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      method,
      path,
      body: canonicalize(body ?? null),
    }))
    .digest('hex');
}
