import { ApiError } from '../domain/apiError.js';
import { idempotencyRequestHash } from '../domain/idempotency.js';
import {
  beginIdempotentCommand,
  completeIdempotentCommand,
  releaseIdempotentCommand,
} from '../repositories/idempotencyRepository.js';

function requestHash(req) {
  return idempotencyRequestHash({
    method: req.method,
    path: req.route?.path ?? req.path,
    body: req.body ?? null,
  });
}

function readKey(req) {
  const key = String(req.get('Idempotency-Key') ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
    throw new ApiError('Envie um Idempotency-Key válido para esta operação.', {
      status: 400,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
  }
  return key;
}

export async function executeIdempotent(req, scope, handler) {
  const key = readKey(req);
  const result = await beginIdempotentCommand({
    userCode: Number(req.user.funcional),
    scope,
    key,
    method: req.method,
    path: req.originalUrl,
    requestHash: requestHash(req),
  });

  if (result.state === 'HASH_CONFLICT') {
    throw new ApiError('A chave de idempotência já foi usada com outro conteúdo.', {
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
    });
  }
  if (result.state === 'IN_PROGRESS') {
    throw new ApiError('Esta operação já está sendo processada.', {
      status: 409,
      code: 'IDEMPOTENT_COMMAND_IN_PROGRESS',
    });
  }
  if (result.state === 'COMPLETED') {
    return {
      status: Number(result.row.RESPONSE_STATUS),
      body: JSON.parse(result.row.RESPONSE_JSON),
      replayed: true,
    };
  }

  try {
    const response = await handler();
    await completeIdempotentCommand(result.id, response.status, response.body);
    return { ...response, replayed: false };
  } catch (error) {
    await releaseIdempotentCommand(result.id, error?.code ?? 'INTERNAL_ERROR').catch(() => undefined);
    throw error;
  }
}
