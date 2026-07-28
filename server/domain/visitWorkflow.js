import { ApiError } from './apiError.js';

export const VISIT_STATUS = Object.freeze({
  PENDING: 'PENDENTE',
  IN_PROGRESS: 'EM_ANDAMENTO',
  COMPLETED: 'REALIZADA',
  NOT_COMPLETED: 'NAO_REALIZADA',
  RESCHEDULED: 'REAGENDADA',
  CANCELLED: 'CANCELADA',
});

export const TERMINAL_VISIT_STATUSES = new Set([
  VISIT_STATUS.COMPLETED,
  VISIT_STATUS.NOT_COMPLETED,
  VISIT_STATUS.RESCHEDULED,
  VISIT_STATUS.CANCELLED,
]);

export const PRODUCT_TREATMENT_STATUS = Object.freeze({
  PENDING: 'PENDENTE',
  TREATED: 'TRATADO',
  NOT_ADDRESSED: 'NAO_ABORDADO',
});

export const COMMERCIAL_RESULTS = new Set([
  'SEM_RESULTADO',
  'APRESENTADO',
  'INTERESSE',
  'PROPOSTA',
  'CONTRATADO',
  'TRANSACIONOU',
  'SEM_INTERESSE',
  'SEM_OPORTUNIDADE',
  'OUTRO',
]);

export const PRODUCT_RESULTS = new Set([
  'APRESENTADO',
  'INTERESSE',
  'PROPOSTA',
  'CONTRATADO',
  'TRANSACIONOU',
  'SEM_INTERESSE',
  'SEM_OPORTUNIDADE',
  'NAO_ABORDADO',
  'OUTRO',
]);

export const NOT_COMPLETED_REASONS = new Set([
  'ESTABELECIMENTO_FECHADO',
  'RESPONSAVEL_AUSENTE',
  'ENDERECO_NAO_LOCALIZADO',
  'PROBLEMA_DESLOCAMENTO',
  'REAGENDADA_COM_CLIENTE',
  'OUTRO',
]);

export const PRIORITIES = new Set(['BAIXA', 'NORMAL', 'ALTA', 'CRITICA']);

const transitions = new Map([
  [VISIT_STATUS.PENDING, new Set([
    VISIT_STATUS.IN_PROGRESS,
    VISIT_STATUS.NOT_COMPLETED,
    VISIT_STATUS.RESCHEDULED,
    VISIT_STATUS.CANCELLED,
  ])],
  [VISIT_STATUS.IN_PROGRESS, new Set([
    VISIT_STATUS.COMPLETED,
    VISIT_STATUS.NOT_COMPLETED,
    VISIT_STATUS.RESCHEDULED,
  ])],
]);

export function assertVisitTransition(current, next) {
  if (!transitions.get(current)?.has(next)) {
    throw new ApiError(`A visita não pode mudar de ${current} para ${next}.`, {
      status: 409,
      code: 'VISIT_INVALID_TRANSITION',
    });
  }
}

export function assertVisitEditable(status) {
  if (TERMINAL_VISIT_STATUSES.has(status)) {
    throw new ApiError('A visita já está encerrada.', {
      status: 409,
      code: 'VISIT_ALREADY_FINISHED',
    });
  }
}

export function assertRouteMutableVisit(status) {
  if (status !== VISIT_STATUS.PENDING) {
    throw new ApiError('Somente visitas pendentes podem ser alteradas pelo roteiro.', {
      status: 409,
      code: 'ROUTE_VISIT_ALREADY_STARTED',
    });
  }
}

export function assertProductsComplete(products) {
  const pending = products
    .filter((product) => product.ATIVO !== false && product.ATIVO !== 0)
    .filter((product) => product.STATUS_TRATATIVA === PRODUCT_TREATMENT_STATUS.PENDING);
  if (pending.length > 0) {
    throw new ApiError('Todos os produtos foco precisam de tratativa ou justificativa.', {
      status: 422,
      code: 'VISIT_PRODUCTS_INCOMPLETE',
      errors: pending.map((product) => ({
        field: `products[${product.ID}]`,
        code: 'PRODUCT_TREATMENT_REQUIRED',
        message: `Informe a tratativa de ${product.NOME_PRODUTO_SNAPSHOT}.`,
      })),
    });
  }
}

const focusMap = new Map([
  ['CREDITO', 'CREDITO'],
  ['CIELO', 'CIELO'],
  ['NEGOCIO', 'FAZER_NEGOCIO'],
  ['FAZER NEGOCIO', 'FAZER_NEGOCIO'],
  ['ATIVO PADE', 'ATIVO_PADE'],
  ['PROPOSTA DE VALOR', 'PROPOSTA_VALOR'],
  ['PROPOSTA VALOR', 'PROPOSTA_VALOR'],
  ['RELACIONAMENTO', 'RELACIONAMENTO'],
]);

function normalizeFocus(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function productCodesFromFocusLabels(labels) {
  const codes = [];
  for (const label of Array.isArray(labels) ? labels : []) {
    const code = focusMap.get(normalizeFocus(label));
    if (!code) {
      throw new ApiError(`Produto foco não reconhecido: ${String(label)}.`, {
        status: 422,
        code: 'UNKNOWN_FOCUS_PRODUCT',
      });
    }
    if (!codes.includes(code)) codes.push(code);
  }
  if (codes.length === 0) {
    throw new ApiError('A visita precisa possuir ao menos um produto foco.', {
      status: 422,
      code: 'VISIT_PRODUCT_REQUIRED',
    });
  }
  return codes;
}

export function requireIsoDate(value, field = 'date') {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApiError('Data inválida. Use YYYY-MM-DD.', {
      code: 'INVALID_DATE_FORMAT',
      errors: [{ field, code: 'INVALID_DATE_FORMAT', message: 'Use YYYY-MM-DD.' }],
    });
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ApiError('Data inexistente.', {
      code: 'INVALID_DATE_FORMAT',
      errors: [{ field, code: 'INVALID_DATE_FORMAT', message: 'Informe uma data existente.' }],
    });
  }
  return text;
}

export function optionalIsoDate(value, field) {
  if (value == null || value === '') return null;
  return requireIsoDate(value, field);
}

export function requireOffsetTimestamp(value, field = 'occurredAt') {
  const text = String(value ?? '');
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    throw new ApiError('O horário precisa incluir o offset, por exemplo -03:00.', {
      code: 'TIMESTAMP_OFFSET_REQUIRED',
      errors: [{ field, code: 'TIMESTAMP_OFFSET_REQUIRED', message: 'Inclua o offset do fuso.' }],
    });
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError('Data e horário inválidos.', {
      code: 'INVALID_TIMESTAMP',
      errors: [{ field, code: 'INVALID_TIMESTAMP', message: 'Informe um timestamp RFC 3339.' }],
    });
  }
  return parsed;
}

export function timestampOffsetMinutes(value) {
  const text = String(value);
  if (/Z$/i.test(text)) return 0;
  const match = text.match(/([+-])(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

export function optionalText(value, maxLength) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new ApiError(`Texto excede ${maxLength} caracteres.`, {
      code: 'TEXT_TOO_LONG',
    });
  }
  return normalized;
}

export function requiredText(value, maxLength, field) {
  const normalized = optionalText(value, maxLength);
  if (!normalized) {
    throw new ApiError('Campo obrigatório.', {
      code: 'REQUIRED_FIELD',
      errors: [{ field, code: 'REQUIRED_FIELD', message: 'Campo obrigatório.' }],
    });
  }
  return normalized;
}

export function addCalendarDays(date, days) {
  return new Date(date.getTime() + Number(days) * 24 * 60 * 60 * 1000);
}
