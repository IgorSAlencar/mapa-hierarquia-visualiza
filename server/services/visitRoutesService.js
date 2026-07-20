import {
  fetchAuthorizedRouteOwners,
  fetchAuthorizedStoreKeys,
  fetchVisitRouteById,
  fetchVisitRouteSummaries,
  fetchVisitRouteSummaryBySupervision,
  insertVisitRoute,
  deleteVisitRouteById,
} from '../repositories/visitRoutesRepository.js';

// SQL Server NEWSEQUENTIALID() gera UNIQUEIDENTIFIER válido, mas não
// necessariamente usa os bits de versão/variante exigidos pelo UUID RFC.
const SQL_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STOPS = 200;
const MAX_GEOMETRY_POINTS = 100_000;

export class VisitRouteError extends Error {
  constructor(message, status = 400, code = 'INVALID_ROUTE') {
    super(message);
    this.name = 'VisitRouteError';
    this.status = status;
    this.code = code;
  }
}

function text(value, maxLength, required = false) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new VisitRouteError('Campo obrigatório ausente.');
  return normalized ? normalized.slice(0, maxLength) : null;
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new VisitRouteError('Valor numérico inválido.');
  }
  return parsed;
}

function coordinate(value, kind) {
  const parsed = Number(value);
  const [min, max] = kind === 'lat' ? [-90, 90] : [-180, 180];
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new VisitRouteError('Coordenada inválida.');
  }
  return parsed;
}

function endpoint(value, required) {
  if (!value && !required) return null;
  if (!value || typeof value !== 'object') throw new VisitRouteError('Origem ou destino inválido.');
  return {
    nome: text(value.nome, 250, true),
    lat: coordinate(value.lat, 'lat'),
    lng: coordinate(value.lng, 'lng'),
  };
}

function opportunitySnapshot(value) {
  const fields = [
    'oportunidadeCielo',
    'oportunidadeCredito',
    'oportunidadeNegocio',
    'oportunidadeAtivoPade',
    'oportunidadePropostaValor',
  ];
  if (!value || typeof value !== 'object' || fields.some((field) => typeof value[field] !== 'boolean')) {
    throw new VisitRouteError('Snapshot de oportunidades inválido.');
  }
  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function routeStop(value, index) {
  if (!value || typeof value !== 'object') throw new VisitRouteError('Parada inválida.');
  const focos = Array.isArray(value.focos)
    ? value.focos.map((item) => text(item, 100, true)).slice(0, 5)
    : [];
  if (focos.length === 0) throw new VisitRouteError('A parada precisa ter ao menos um foco.');
  return {
    ordem: integer(value.ordem ?? index + 1, { min: 1, max: MAX_STOPS }),
    chaveLoja: text(value.chaveLoja, 100, true),
    codAg: text(value.codAg, 20),
    nome: text(value.nome, 250, true),
    horario: text(value.horario, 20, true),
    status: value.status === 'concluida' ? 'concluida' : 'pendente',
    endereco: text(value.endereco, 500),
    cep: text(value.cep, 250),
    produtoFoco: text(value.produtoFoco, 500, true),
    focos,
    oportunidades: opportunitySnapshot(value.oportunidades),
    ultimaVisita: text(value.ultimaVisita, 100),
    proximaAcao: text(value.proximaAcao, 1000),
    lat: coordinate(value.lat, 'lat'),
    lng: coordinate(value.lng, 'lng'),
  };
}

function geometry(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_GEOMETRY_POINTS) {
    throw new VisitRouteError('A geometria viária precisa estar calculada antes de salvar.');
  }
  const normalized = value.map((point) => {
    if (!Array.isArray(point) || point.length < 2) throw new VisitRouteError('Geometria inválida.');
    return [coordinate(point[0], 'lng'), coordinate(point[1], 'lat')];
  });
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 5 * 1024 * 1024) {
    throw new VisitRouteError('Geometria excede o limite permitido.');
  }
  return normalized;
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').slice(0, 10);
  return DATE_PATTERN.test(raw) ? raw : null;
}

function formatDuration(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

function displayDate(date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' })
    .format(new Date(`${date}T12:00:00-03:00`));
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return fallback; }
}

function normalizeGeometry(value) {
  const parsed = parseJson(value, null);
  if (!parsed) return [];
  const raw = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray(parsed.coordinates)
      ? parsed.coordinates
      : [];
  return raw
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => [Number(point[0]), Number(point[1])])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

function ownerDto(row) {
  return {
    funcional: String(row.COD_FUNC).padStart(7, '0'),
    nome: String(row.NOME_FUNC ?? '').trim(),
    chaveSupervisao: Number(row.CHAVE_SUPERVISAO),
    descricaoSupervisao: String(row.DESC_SUPERVISAO ?? '').trim() || null,
  };
}

export async function getAuthorizedRouteOwners(user, storeKeys = []) {
  return (await fetchAuthorizedRouteOwners(user, { storeKeys })).map(ownerDto);
}

function normalizeSavePayload(body, user, owner) {
  if (!SQL_GUID_PATTERN.test(String(body?.requestId ?? ''))) {
    throw new VisitRouteError('Identificador da requisição inválido.');
  }
  if (!DATE_PATTERN.test(String(body?.plannedDate ?? ''))) {
    throw new VisitRouteError('Data do roteiro inválida.');
  }
  if (!Array.isArray(body?.stops) || body.stops.length < 1 || body.stops.length > MAX_STOPS) {
    throw new VisitRouteError(`O roteiro deve ter entre 1 e ${MAX_STOPS} paradas.`);
  }
  const duration = body.durationBreakdown ?? {};
  const stops = body.stops.map(routeStop).sort((a, b) => a.ordem - b.ordem);
  if (new Set(stops.map((stop) => stop.ordem)).size !== stops.length) {
    throw new VisitRouteError('A ordem das paradas não pode se repetir.');
  }
  return {
    requestId: body.requestId,
    owner,
    createdBy: { funcional: user.funcional, nome: user.nome },
    plannedDate: body.plannedDate,
    nome: text(body.nome, 250, true),
    origin: endpoint(body.origin, true),
    destination: endpoint(body.destination, false),
    // A Directions API devolve metros como ponto flutuante. O banco armazena
    // metros inteiros, portanto normalizamos antes da validação.
    distanceMeters: integer(Math.round(Number(body.distanceMeters)), { min: 1, max: 100_000_000 }),
    durationBreakdown: {
      travelMinutes: integer(duration.travelMinutes, { min: 0, max: 100_000 }),
      visitMinutes: integer(duration.visitMinutes, { min: 0, max: 100_000 }),
      minutesPerVisit: integer(duration.minutesPerVisit, { min: 1, max: 1440 }),
    },
    routeGeometry: geometry(body.routeGeometry),
    stops,
  };
}

export async function saveVisitRoute(body, user) {
  const owners = await getAuthorizedRouteOwners(user);
  const requestedFuncional = String(body?.ownerFuncional ?? '').padStart(7, '0');
  const requestedSupervision = Number(body?.chaveSupervisao);
  const owner = owners.find((item) =>
    item.funcional === requestedFuncional && item.chaveSupervisao === requestedSupervision
  );
  if (!owner) throw new VisitRouteError('Gerente Comercial fora do escopo autorizado.', 403, 'FORBIDDEN_OWNER');

  const payload = normalizeSavePayload(body, user, owner);
  const requestedStoreKeys = [...new Set(payload.stops.map((stop) => stop.chaveLoja))];
  const authorizedStoreKeys = new Set(await fetchAuthorizedStoreKeys(owner.chaveSupervisao, requestedStoreKeys));
  const unauthorized = requestedStoreKeys.filter((key) => !authorizedStoreKeys.has(key));
  if (unauthorized.length > 0) {
    throw new VisitRouteError('Uma ou mais lojas não pertencem ao escopo do GC responsável.', 422, 'STORE_OUT_OF_SCOPE');
  }

  const inserted = await insertVisitRoute(payload);
  return getVisitRoute(String(inserted.id), user);
}

function summaryDto(row) {
  const plannedDate = isoDate(row.DATA_ROTEIRO);
  const totalMinutes = Number(row.DESLOCAMENTO_MINUTOS) + Number(row.VISITAS_MINUTOS);
  return {
    id: String(row.ID),
    nome: String(row.NOME),
    plannedDate,
    version: Number(row.VERSAO),
    savedAt: new Date(row.CRIADO_EM).toISOString(),
    owner: {
      funcional: String(row.COD_FUNC_RESPONSAVEL).padStart(7, '0'),
      nome: String(row.NOME_RESPONSAVEL),
      chaveSupervisao: Number(row.CHAVE_SUPERVISAO),
      descricaoSupervisao: String(row.DESC_SUPERVISAO ?? '') || null,
    },
    createdBy: {
      funcional: String(row.COD_FUNC_CRIADOR).padStart(7, '0'),
      nome: String(row.NOME_CRIADOR),
    },
    stopCount: Number(row.TOTAL_PARADAS),
    distanceMeters: Number(row.DISTANCIA_METROS),
    durationMinutes: totalMinutes,
  };
}

export async function listVisitRoutes({ user, from, to, chaveSupervisao = null, offset = 0, limit = 50 }) {
  const rows = await fetchVisitRouteSummaries({
    user,
    from,
    to,
    chaveSupervisao,
    offset,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit).map(summaryDto),
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function getVisitRouteSummary({ user, from, to }) {
  const rows = await fetchVisitRouteSummaryBySupervision({ user, from, to });
  return rows.map((row) => ({
    chaveSupervisao: Number(row.CHAVE_SUPERVISAO),
    routes: Number(row.TOTAL_ROTEIROS),
    managersWithRoute: Number(row.GERENTES_COM_ROTEIRO),
    visits: Number(row.TOTAL_VISITAS ?? 0),
  }));
}

export async function getVisitRoute(id, user) {
  if (!SQL_GUID_PATTERN.test(String(id ?? ''))) throw new VisitRouteError('Roteiro inválido.');
  const result = await fetchVisitRouteById(id, user);
  if (!result) throw new VisitRouteError('Roteiro não encontrado.', 404, 'NOT_FOUND');
  const { header, stops } = result;
  const plannedDate = isoDate(header.DATA_ROTEIRO);
  const travelMinutes = Number(header.DESLOCAMENTO_MINUTOS);
  const visitMinutes = Number(header.VISITAS_MINUTOS);
  return {
    id: String(header.ID),
    chaveSupervisao: Number(header.CHAVE_SUPERVISAO),
    gerenteComercial: String(header.NOME_RESPONSAVEL),
    nome: String(header.NOME),
    data: displayDate(plannedDate),
    plannedDate,
    distanciaKm: Math.max(1, Math.round(Number(header.DISTANCIA_METROS) / 1000)),
    distanceMeters: Number(header.DISTANCIA_METROS),
    duracaoEstimada: formatDuration(travelMinutes + visitMinutes),
    durationBreakdown: {
      travelMinutes,
      visitMinutes,
      minutesPerVisit: Number(header.MINUTOS_POR_VISITA),
      source: 'calculated',
    },
    owner: {
      funcional: String(header.COD_FUNC_RESPONSAVEL).padStart(7, '0'),
      nome: String(header.NOME_RESPONSAVEL),
      chaveSupervisao: Number(header.CHAVE_SUPERVISAO),
      descricaoSupervisao: String(header.DESC_SUPERVISAO ?? '') || null,
    },
    saved: {
      version: Number(header.VERSAO),
      savedAt: new Date(header.CRIADO_EM).toISOString(),
      createdByFuncional: String(header.COD_FUNC_CRIADOR).padStart(7, '0'),
      createdByName: String(header.NOME_CRIADOR),
    },
    origin: { nome: String(header.ORIGEM_NOME), lat: Number(header.ORIGEM_LAT), lng: Number(header.ORIGEM_LNG) },
    destination: header.DESTINO_NOME
      ? { nome: String(header.DESTINO_NOME), lat: Number(header.DESTINO_LAT), lng: Number(header.DESTINO_LNG) }
      : undefined,
    routeGeometry: normalizeGeometry(header.GEOMETRIA_JSON),
    stops: stops.map((stop) => ({
      id: Number(stop.ORDEM),
      ordem: Number(stop.ORDEM),
      nome: String(stop.NOME),
      horario: String(stop.HORARIO),
      status: stop.STATUS === 'concluida' ? 'concluida' : 'pendente',
      endereco: String(stop.ENDERECO ?? ''),
      cep: String(stop.CEP_CONTEXTO ?? ''),
      produtoFoco: String(stop.PRODUTO_FOCO),
      focos: parseJson(stop.FOCOS_JSON, []),
      oportunidades: parseJson(stop.OPORTUNIDADES_JSON, {}),
      chaveLoja: String(stop.CHAVE_LOJA),
      codAg: String(stop.COD_AG ?? ''),
      ultimaVisita: String(stop.ULTIMA_VISITA ?? ''),
      proximaAcao: String(stop.PROXIMA_ACAO ?? ''),
      lat: Number(stop.LAT),
      lng: Number(stop.LNG),
    })),
  };
}

export async function deleteVisitRoute(id, user) {
  if (!SQL_GUID_PATTERN.test(String(id ?? ''))) throw new VisitRouteError('Roteiro inválido.');
  const deleted = await deleteVisitRouteById(id, user);
  if (!deleted) throw new VisitRouteError('Roteiro não encontrado.', 404, 'NOT_FOUND');
  return { id: String(id) };
}

export function defaultHistoryRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 89);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function validateHistoryDate(value, fallback) {
  return DATE_PATTERN.test(String(value ?? '')) ? String(value) : fallback;
}
