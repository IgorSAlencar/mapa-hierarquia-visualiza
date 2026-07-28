import crypto from 'node:crypto';

export function correlationId(req, res, next) {
  const incoming = String(req.get('X-Correlation-Id') ?? '').trim();
  req.correlationId = /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : crypto.randomUUID();
  res.set('X-Correlation-Id', req.correlationId);
  next();
}
