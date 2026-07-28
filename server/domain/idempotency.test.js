import assert from 'node:assert/strict';
import test from 'node:test';
import { idempotencyRequestHash } from './idempotency.js';

test('hash idempotente independe da ordem das chaves JSON', () => {
  const first = idempotencyRequestHash({
    method: 'POST',
    path: '/api/visitas/1/conclusao',
    body: { visitDate: '2026-07-28', nested: { b: 2, a: 1 } },
  });
  const second = idempotencyRequestHash({
    method: 'POST',
    path: '/api/visitas/1/conclusao',
    body: { nested: { a: 1, b: 2 }, visitDate: '2026-07-28' },
  });
  assert.equal(first, second);
});

test('mesma chave pode detectar payload diferente pelo hash', () => {
  const first = idempotencyRequestHash({
    method: 'POST',
    path: '/api/visitas/1/conclusao',
    body: { result: 'APRESENTADO' },
  });
  const second = idempotencyRequestHash({
    method: 'POST',
    path: '/api/visitas/1/conclusao',
    body: { result: 'CONTRATADO' },
  });
  assert.notEqual(first, second);
});
