export class ApiError extends Error {
  constructor(message, {
    status = 400,
    code = 'INVALID_REQUEST',
    type = null,
    errors = undefined,
    expose = true,
  } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.type = type ?? `https://mapa.interno/errors/${String(code).toLowerCase().replaceAll('_', '-')}`;
    this.errors = errors;
    this.expose = expose;
  }
}

export function sendApiError(res, error, req, context = 'Erro na API:') {
  const isApiError = error instanceof ApiError;
  const status = isApiError ? error.status : 500;
  const correlationId = req.correlationId ?? null;
  if (status >= 500) console.error(context, error);
  const detail = isApiError && error.expose
    ? error.message
    : 'Não foi possível concluir a operação.';
  res.status(status).json({
    type: isApiError ? error.type : 'https://mapa.interno/errors/internal-error',
    title: status >= 500 ? 'Erro interno' : 'Operação não permitida',
    status,
    code: isApiError ? error.code : 'INTERNAL_ERROR',
    detail,
    instance: req.originalUrl,
    correlationId,
    ...(isApiError && error.errors ? { errors: error.errors } : {}),
  });
}
