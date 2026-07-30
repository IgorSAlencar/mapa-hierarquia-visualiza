import crypto from 'node:crypto';
import {
  fetchAuthorizedRouteOwners,
  fetchAuthorizedStoreKeys,
  fetchUserAuthorizedStoreKeys,
  fetchVisitRouteById,
  fetchVisitRouteSummaries,
  fetchVisitRouteSummaryBySupervision,
  fetchVisitRoutesForMap,
  insertVisitRoute,
  deleteVisitRouteById,
  patchVisitRouteById,
} from '../repositories/visitRoutesRepository.js';
import { canAssignRouteOutsideOwnerPortfolio } from '../auth/routeAssignmentPolicy.js';
import {
  fetchStoreCertifications,
  fetchStoreProductionHistory,
} from '../repositories/mapDataRepository.js';
import { normalizeStoreCertificationRows } from './storeCertificationNormalizer.js';
import { normalizeStoreProductionRows } from './storeProductionNormalizer.js';
import { PRIORITIES } from '../domain/visitWorkflow.js';
import { FEATURES } from '../config/features.js';
import { flushNotificationOutbox } from './outboxDispatcher.js';

// SQL Server NEWSEQUENTIALID() gera UNIQUEIDENTIFIER válido, mas não
// necessariamente usa os bits de versão/variante exigidos pelo UUID RFC.
const SQL_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STOPS = 200;
const MAX_GEOMETRY_POINTS = 100_000;
const MAX_DAILY_ROUTE_OWNERS = 15;
const MAX_HISTORY_DAYS = 90;

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

function normalizeChecklistStatus(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'OK' || normalized === 'VENCIDO' || normalized === 'NÃO APTO') return normalized;
  return null;
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
    ? value.focos.map((item) => text(item, 100, true)).slice(0, 20)
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

function visitStopStatus(row) {
  return ({
    EM_ANDAMENTO: 'em_andamento',
    REALIZADA: 'concluida',
    NAO_REALIZADA: 'nao_realizada',
    REAGENDADA: 'reagendada',
    CANCELADA: 'cancelada',
  })[String(row.VISITA_STATUS ?? '').trim().toUpperCase()]
    ?? (row.STATUS === 'concluida' ? 'concluida' : 'pendente');
}

function ownerDto(row) {
  return {
    funcional: String(row.COD_FUNC).padStart(7, '0'),
    nome: String(row.NOME_FUNC ?? '').trim(),
    chaveSupervisao: Number(row.CHAVE_SUPERVISAO),
    descricaoSupervisao: String(row.DESC_SUPERVISAO ?? '').trim() || null,
    chaveCoordenacao: Number.isFinite(Number(row.CHAVE_COORDENACAO))
      ? Number(row.CHAVE_COORDENACAO)
      : null,
    descricaoCoordenacao: String(row.DESC_COORDENACAO ?? '').trim() || null,
    nomeCoordenador: String(row.NOME_COORDENADOR ?? '').trim() || null,
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
    correlationId: crypto.randomUUID(),
    owner,
    createdBy: { funcional: user.funcional, nome: user.nome },
    plannedDate: body.plannedDate,
    nome: text(body.nome, 250, true),
    priority: PRIORITIES.has(String(body.priority ?? 'NORMAL').toUpperCase())
      ? String(body.priority ?? 'NORMAL').toUpperCase()
      : 'NORMAL',
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
  const canAssignOutsidePortfolio = canAssignRouteOutsideOwnerPortfolio(user);
  const authorizedStoreKeys = new Set(await (
    canAssignOutsidePortfolio
      ? fetchUserAuthorizedStoreKeys(user, requestedStoreKeys)
      : fetchAuthorizedStoreKeys(owner.chaveSupervisao, requestedStoreKeys)
  ));
  const unauthorized = requestedStoreKeys.filter((key) => !authorizedStoreKeys.has(key));
  if (unauthorized.length > 0) {
    throw new VisitRouteError(
      canAssignOutsidePortfolio
        ? 'Uma ou mais lojas estão fora do seu escopo hierárquico.'
        : 'Uma ou mais lojas não pertencem ao escopo do GC responsável.',
      422,
      'STORE_OUT_OF_SCOPE'
    );
  }

  const inserted = await insertVisitRoute(payload);
  if (FEATURES.notifications) {
    try {
      await flushNotificationOutbox();
    } catch (error) {
      console.error('[notifications:flush-after-save]', error);
    }
  }
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
    savedAt: new Date(row.CRIADO_EM_UTC).toISOString(),
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

function validCivilDate(value) {
  const raw = String(value ?? '');
  if (!DATE_PATTERN.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function civilDateValue(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function addCivilDays(value, amount) {
  const date = new Date(civilDateValue(value));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function inclusiveDayCount(from, to) {
  return Math.floor((civilDateValue(to) - civilDateValue(from)) / 86_400_000) + 1;
}

function normalizeMapDate(value, fieldName = 'data') {
  const normalized = String(value ?? '');
  if (!validCivilDate(normalized)) {
    throw new VisitRouteError(
      `${fieldName} inválida.`,
      400,
      'INVALID_MAP_DATE'
    );
  }
  return normalized;
}

function normalizeSupervisionKeys(values, max = MAX_DAILY_ROUTE_OWNERS) {
  const raw = Array.isArray(values) ? values : [values];
  const parsed = raw.map(Number);
  if (
    parsed.length === 0
    || parsed.some((value) => !Number.isInteger(value) || value <= 0)
  ) {
    throw new VisitRouteError(
      'Informe ao menos uma supervisão válida.',
      400,
      'INVALID_SUPERVISION'
    );
  }
  const unique = [...new Set(parsed)];
  if (unique.length > max) {
    throw new VisitRouteError(
      `Selecione no máximo ${max} Gerentes Comerciais.`,
      400,
      'TOO_MANY_ROUTE_OWNERS'
    );
  }
  return unique;
}

async function authorizedOwners(user, supervisionKeys) {
  const owners = await getAuthorizedRouteOwners(user);
  const bySupervision = new Map(
    owners.map((owner) => [Number(owner.chaveSupervisao), owner])
  );
  const unauthorized = supervisionKeys.filter((key) => !bySupervision.has(key));
  if (unauthorized.length > 0) {
    throw new VisitRouteError(
      'Um ou mais Gerentes Comerciais estão fora do escopo autorizado.',
      403,
      'FORBIDDEN_OWNER'
    );
  }
  return supervisionKeys.map((key) => bySupervision.get(key));
}

function mapRouteRows({ headers, stops }) {
  const stopsByRoute = new Map();
  for (const stop of stops) {
    const routeId = String(stop.ROTEIRO_ID).toLowerCase();
    const items = stopsByRoute.get(routeId) ?? [];
    items.push({
      id: Number(stop.ID),
      ordem: Number(stop.ORDEM),
      nome: String(stop.NOME ?? ''),
      chaveLoja: String(stop.CHAVE_LOJA ?? ''),
      codAg: String(stop.COD_AG ?? ''),
      horario: String(stop.HORARIO ?? ''),
      endereco: String(stop.ENDERECO ?? ''),
      cep: String(stop.CEP_CONTEXTO ?? ''),
      produtoFoco: String(stop.PRODUTO_FOCO ?? ''),
      focos: parseJson(stop.FOCOS_JSON, []),
      oportunidades: parseJson(stop.OPORTUNIDADES_JSON, {}),
      ultimaVisita: String(stop.ULTIMA_VISITA ?? ''),
      proximaAcao: String(stop.PROXIMA_ACAO ?? ''),
      lat: Number(stop.LAT),
      lng: Number(stop.LNG),
      status: visitStopStatus(stop),
      currentVisitId: stop.VISITA_ID == null ? null : String(stop.VISITA_ID),
      visitStatus: stop.VISITA_STATUS == null ? null : String(stop.VISITA_STATUS),
      active: stop.ATIVO == null ? true : Boolean(stop.ATIVO),
    });
    stopsByRoute.set(routeId, items);
  }

  return headers.map((header) => {
    const id = String(header.ID);
    const plannedDate = isoDate(header.DATA_ROTEIRO);
    const travelMinutes = Number(header.DESLOCAMENTO_MINUTOS);
    const visitMinutes = Number(header.VISITAS_MINUTOS);
    const durationMinutes = travelMinutes + visitMinutes;
    const distanceMeters = Number(header.DISTANCIA_METROS);
    const savedAt = new Date(header.CRIADO_EM_UTC).toISOString();
    const routeStops = stopsByRoute.get(id.toLowerCase()) ?? [];
    const owner = {
      funcional: String(header.COD_FUNC_RESPONSAVEL).padStart(7, '0'),
      nome: String(header.NOME_RESPONSAVEL ?? ''),
      chaveSupervisao: Number(header.CHAVE_SUPERVISAO),
      descricaoSupervisao: String(header.DESC_SUPERVISAO ?? '') || null,
    };
    return {
      id,
      nome: String(header.NOME ?? ''),
      plannedDate,
      version: Number(header.VERSAO),
      savedAt,
      owner,
      stopCount: routeStops.length,
      distanceMeters,
      durationMinutes,
      routeGeometry: normalizeGeometry(header.GEOMETRIA_JSON),
      origin: {
        nome: String(header.ORIGEM_NOME ?? ''),
        lat: Number(header.ORIGEM_LAT),
        lng: Number(header.ORIGEM_LNG),
      },
      destination: header.DESTINO_NOME
        ? {
            nome: String(header.DESTINO_NOME),
            lat: Number(header.DESTINO_LAT),
            lng: Number(header.DESTINO_LNG),
          }
        : undefined,
      stops: routeStops,
      // Aliases mantidos para integração direta com o VisitRoute já usado no mapa.
      chaveSupervisao: owner.chaveSupervisao,
      gerenteComercial: owner.nome,
      data: displayDate(plannedDate),
      distanciaKm: Math.max(1, Math.round(distanceMeters / 1000)),
      duracaoEstimada: formatDuration(durationMinutes),
      durationBreakdown: {
        travelMinutes,
        visitMinutes,
        minutesPerVisit: Number(header.MINUTOS_POR_VISITA),
        source: 'calculated',
      },
      saved: {
        version: Number(header.VERSAO),
        savedAt,
        createdByFuncional: String(header.COD_FUNC_CRIADOR).padStart(7, '0'),
        createdByName: String(header.NOME_CRIADOR ?? ''),
      },
      managementStatus: String(header.STATUS_GESTAO ?? 'ATIVO'),
      priority: String(header.PRIORIDADE ?? 'NORMAL'),
      rowVersion: header.VERSAO_LINHA
        ? Buffer.from(header.VERSAO_LINHA).toString('base64')
        : null,
    };
  });
}

function workingDaysBetween(from, to) {
  let count = 0;
  for (let current = from; current <= to; current = addCivilDays(current, 1)) {
    const day = new Date(civilDateValue(current)).getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

function mondayOfWeek(value) {
  const date = new Date(civilDateValue(value));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function statusCounts(routes) {
  const stops = routes.flatMap((route) => route.stops.filter((stop) => stop.active));
  return {
    plannedVisits: stops.length,
    completedVisits: stops.filter((stop) => stop.status === 'concluida').length,
    notCompletedVisits: stops.filter((stop) => stop.status === 'nao_realizada').length,
    rescheduledVisits: stops.filter((stop) => stop.status === 'reagendada').length,
    pendingVisits: stops.filter((stop) =>
      stop.status === 'pendente' || stop.status === 'em_andamento'
    ).length,
  };
}

function buildWeeklySeries(routes, from, to) {
  const buckets = new Map();
  for (
    let weekStart = mondayOfWeek(from);
    weekStart <= to;
    weekStart = addCivilDays(weekStart, 7)
  ) {
    buckets.set(weekStart, []);
  }
  for (const route of routes) {
    const weekStart = mondayOfWeek(route.plannedDate);
    const bucket = buckets.get(weekStart);
    if (bucket) bucket.push(route);
  }
  return [...buckets.entries()].map(([weekStart, weekRoutes]) => {
    const counts = statusCounts(weekRoutes);
    return {
      weekStart,
      routeDays: new Set(weekRoutes.map((route) => route.plannedDate)).size,
      routes: weekRoutes.length,
      distanceMeters: weekRoutes.reduce((total, route) => total + route.distanceMeters, 0),
      plannedVisits: counts.plannedVisits,
      completedVisits: counts.completedVisits,
      completionRate: percentage(counts.completedVisits, counts.plannedVisits),
    };
  });
}

export function buildHistoricalRouteAnalysis(routes, from, to) {
  const counts = statusCounts(routes);
  const routeDates = new Set(routes.map((route) => route.plannedDate));
  const weekdayRouteDays = [...routeDates].filter((date) => {
    const day = new Date(civilDateValue(date)).getUTCDay();
    return day !== 0 && day !== 6;
  }).length;
  const workingDays = workingDaysBetween(from, to);
  const totalDistanceMeters = routes.reduce(
    (total, route) => total + Number(route.distanceMeters || 0),
    0
  );
  return {
    metrics: {
      routeDays: routeDates.size,
      workingRouteDays: weekdayRouteDays,
      workingDays,
      frequencyRate: percentage(weekdayRouteDays, workingDays),
      totalRoutes: routes.length,
      totalDistanceMeters,
      averageDistanceMeters: routes.length
        ? Math.round(totalDistanceMeters / routes.length)
        : 0,
      ...counts,
      completionRate: percentage(counts.completedVisits, counts.plannedVisits),
    },
    weeklySeries: buildWeeklySeries(routes, from, to),
  };
}

export async function getDailyVisitRouteMap({ user, date, chaveSupervisoes }) {
  const normalizedDate = normalizeMapDate(date, 'Data');
  const supervisionKeys = normalizeSupervisionKeys(chaveSupervisoes);
  await authorizedOwners(user, supervisionKeys);
  const routes = mapRouteRows(await fetchVisitRoutesForMap({
    user,
    from: normalizedDate,
    to: normalizedDate,
    chaveSupervisoes: supervisionKeys,
  }));
  const found = new Set(routes.map((route) => route.owner.chaveSupervisao));
  return {
    date: normalizedDate,
    routes,
    missingSupervisionKeys: supervisionKeys.filter((key) => !found.has(key)),
  };
}

export async function getHistoricalVisitRouteMap({
  user,
  from,
  to,
  chaveSupervisao,
}) {
  const normalizedFrom = normalizeMapDate(from, 'Data inicial');
  const normalizedTo = normalizeMapDate(to, 'Data final');
  if (normalizedFrom > normalizedTo) {
    throw new VisitRouteError('Período da análise inválido.', 400, 'INVALID_MAP_RANGE');
  }
  if (inclusiveDayCount(normalizedFrom, normalizedTo) > MAX_HISTORY_DAYS) {
    throw new VisitRouteError(
      `A análise histórica aceita no máximo ${MAX_HISTORY_DAYS} dias.`,
      400,
      'HISTORY_RANGE_TOO_LARGE'
    );
  }
  const [supervisionKey] = normalizeSupervisionKeys([chaveSupervisao], 1);
  const [owner] = await authorizedOwners(user, [supervisionKey]);
  const routes = mapRouteRows(await fetchVisitRoutesForMap({
    user,
    from: normalizedFrom,
    to: normalizedTo,
    chaveSupervisoes: [supervisionKey],
    ownerFuncional: owner.funcional,
  }));
  const analysis = buildHistoricalRouteAnalysis(routes, normalizedFrom, normalizedTo);
  return {
    from: normalizedFrom,
    to: normalizedTo,
    owner,
    routes,
    ...analysis,
  };
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
      savedAt: new Date(header.CRIADO_EM_UTC).toISOString(),
      createdByFuncional: String(header.COD_FUNC_CRIADOR).padStart(7, '0'),
      createdByName: String(header.NOME_CRIADOR),
    },
    managementStatus: String(header.STATUS_GESTAO ?? 'ATIVO'),
    priority: String(header.PRIORIDADE ?? 'NORMAL'),
    rowVersion: header.VERSAO_LINHA
      ? Buffer.from(header.VERSAO_LINHA).toString('base64')
      : null,
    origin: { nome: String(header.ORIGEM_NOME), lat: Number(header.ORIGEM_LAT), lng: Number(header.ORIGEM_LNG) },
    destination: header.DESTINO_NOME
      ? { nome: String(header.DESTINO_NOME), lat: Number(header.DESTINO_LAT), lng: Number(header.DESTINO_LNG) }
      : undefined,
    routeGeometry: normalizeGeometry(header.GEOMETRIA_JSON),
    stops: stops.map((stop) => ({
      id: Number(stop.ID),
      ordem: Number(stop.ORDEM),
      nome: String(stop.NOME),
      horario: String(stop.HORARIO),
      status: visitStopStatus(stop),
      endereco: String(stop.ENDERECO ?? ''),
      cep: String(stop.CEP_CONTEXTO ?? ''),
      produtoFoco: String(stop.PRODUTO_FOCO),
      focos: parseJson(stop.FOCOS_JSON, []),
      oportunidades: parseJson(stop.OPORTUNIDADES_JSON, {}),
      chaveLoja: String(stop.CHAVE_LOJA),
      codAg: String(stop.COD_AG ?? ''),
      nomeAg: String(stop.NOME_AG ?? '').trim() || null,
      statusTablet: String(stop.STATUS_TABLET ?? '').trim() || null,
      checklist: normalizeChecklistStatus(stop.STATUS_CHECKLIST),
      municipio: String(stop.MUNICIPIO ?? '').trim() || null,
      uf: String(stop.UF ?? '').trim().toUpperCase() || null,
      ultimaVisita: String(stop.ULTIMA_VISITA ?? ''),
      proximaAcao: String(stop.PROXIMA_ACAO ?? ''),
      lat: Number(stop.LAT),
      lng: Number(stop.LNG),
      active: stop.ATIVO == null ? true : Boolean(stop.ATIVO),
      currentVisitId: stop.VISITA_ID == null ? null : String(stop.VISITA_ID),
      visitStatus: stop.VISITA_STATUS == null ? null : String(stop.VISITA_STATUS),
      visitRowVersion: stop.VISITA_VERSAO_LINHA
        ? Buffer.from(stop.VISITA_VERSAO_LINHA).toString('base64')
        : null,
      productProgress: {
        treated: Number(stop.PRODUTOS_TRATADOS ?? 0),
        total: Number(stop.TOTAL_PRODUTOS ?? 0),
      },
    })),
  };
}

/**
 * Consolida a producao mensal das lojas de um roteiro ja autorizado.
 * A autorizacao deriva do cabecalho do roteiro, permitindo que o GC designado
 * exporte uma rota recebida mesmo quando uma parada nao pertence a sua carteira.
 */
export async function getVisitRouteExportData(id, user) {
  const route = await getVisitRoute(id, user);
  const storeKeys = [...new Set(
    route.stops
      .map((stop) => String(stop.chaveLoja ?? '').trim())
      .filter(Boolean)
  )];
  const stores = [];
  const concurrency = Math.min(5, storeKeys.length);
  let cursor = 0;

  async function worker() {
    while (cursor < storeKeys.length) {
      const index = cursor;
      cursor += 1;
      const chaveLoja = storeKeys[index];
      const [productionRows, certificationRows] = await Promise.all([
        fetchStoreProductionHistory(chaveLoja),
        fetchStoreCertifications(chaveLoja),
      ]);
      const rows = normalizeStoreProductionRows(productionRows);
      const sorted = rows.slice().sort((a, b) => b.periodo - a.periodo);
      stores[index] = {
        chaveLoja,
        production: sorted[0] ?? null,
        previousProduction: sorted[1] ?? null,
        certification: normalizeStoreCertificationRows(certificationRows),
      };
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { stores };
}

export async function deleteVisitRoute(id, user) {
  if (!SQL_GUID_PATTERN.test(String(id ?? ''))) throw new VisitRouteError('Roteiro inválido.');
  const deleted = await deleteVisitRouteById(id, user);
  if (!deleted) throw new VisitRouteError('Roteiro não encontrado.', 404, 'NOT_FOUND');
  return { id: String(id) };
}

function normalizeRouteIfMatch(value) {
  const normalized = String(value ?? '').trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  if (!normalized) {
    throw new VisitRouteError(
      'Envie If-Match com a versão atual do roteiro.',
      428,
      'PRECONDITION_REQUIRED'
    );
  }
  return normalized;
}

export async function patchVisitRoute(id, body, user, ifMatch) {
  if (!SQL_GUID_PATTERN.test(String(id ?? ''))) throw new VisitRouteError('Roteiro inválido.');
  if (!user?.isAdmin && user?.role === 'supervisor') {
    throw new VisitRouteError(
      'Somente gestores podem alterar um roteiro atribuído.',
      403,
      'ROUTE_PATCH_FORBIDDEN'
    );
  }
  const current = await getVisitRoute(id, user);
  if (normalizeRouteIfMatch(ifMatch) !== current.rowVersion) {
    throw new VisitRouteError(
      'O roteiro foi alterado por outra operação. Atualize os dados.',
      412,
      'ROW_VERSION_MISMATCH'
    );
  }

  let owner = null;
  if (body?.ownerFuncional != null || body?.chaveSupervisao != null) {
    const owners = await getAuthorizedRouteOwners(user);
    const funcional = String(body.ownerFuncional ?? '').padStart(7, '0');
    const supervision = Number(body.chaveSupervisao);
    owner = owners.find((candidate) =>
      candidate.funcional === funcional && candidate.chaveSupervisao === supervision
    );
    if (!owner) {
      throw new VisitRouteError(
        'Gerente Comercial fora do escopo autorizado.',
        403,
        'FORBIDDEN_OWNER'
      );
    }
  }

  const plannedDate = body?.plannedDate == null
    ? null
    : (DATE_PATTERN.test(String(body.plannedDate))
      ? String(body.plannedDate)
      : (() => { throw new VisitRouteError('Data do roteiro inválida.'); })());
  const priority = body?.priority == null
    ? null
    : String(body.priority).toUpperCase();
  if (priority != null && !PRIORITIES.has(priority)) {
    throw new VisitRouteError('Prioridade inválida.');
  }
  const changeReason = text(body?.changeReason, 1000, true);
  let stops = null;
  if (body?.stops != null) {
    if (!Array.isArray(body.stops) || body.stops.length > MAX_STOPS) {
      throw new VisitRouteError(`O roteiro pode ter no máximo ${MAX_STOPS} paradas.`);
    }
    const currentById = new Map(current.stops.map((stop) => [Number(stop.id), stop]));
    stops = body.stops.map((item, index) => {
      const stopId = item?.id == null ? null : integer(item.id, { min: 1 });
      const existing = stopId == null ? null : currentById.get(stopId);
      if (stopId != null && !existing) {
        throw new VisitRouteError(`Parada ${stopId} não pertence ao roteiro.`);
      }
      const normalized = routeStop({
        ...(existing ?? {}),
        ...item,
        oportunidades: item?.oportunidades ?? existing?.oportunidades,
        focos: item?.focos ?? existing?.focos,
        produtoFoco: item?.produtoFoco
          ?? (item?.focos ?? existing?.focos ?? []).join(', '),
      }, index);
      return { ...normalized, id: stopId };
    });
    if (new Set(stops.map((stop) => stop.ordem)).size !== stops.length) {
      throw new VisitRouteError('A ordem das paradas não pode se repetir.');
    }
    if (new Set(stops.filter((stop) => stop.id != null).map((stop) => stop.id)).size
      !== stops.filter((stop) => stop.id != null).length) {
      throw new VisitRouteError('Uma parada não pode aparecer duas vezes.');
    }
    const targetOwner = owner ?? current.owner;
    const storeKeys = [...new Set(stops.map((stop) => stop.chaveLoja))];
    const authorized = new Set(await (
      canAssignRouteOutsideOwnerPortfolio(user)
        ? fetchUserAuthorizedStoreKeys(user, storeKeys)
        : fetchAuthorizedStoreKeys(targetOwner.chaveSupervisao, storeKeys)
    ));
    if (storeKeys.some((key) => !authorized.has(key))) {
      throw new VisitRouteError(
        'Uma ou mais lojas estão fora do escopo autorizado.',
        422,
        'STORE_OUT_OF_SCOPE'
      );
    }
  }

  const changed = await patchVisitRouteById(id, user, {
    owner,
    plannedDate,
    priority,
    stops,
    changeReason,
    actor: { funcional: user.funcional, nome: user.nome },
    correlationId: crypto.randomUUID(),
  });
  if (!changed) throw new VisitRouteError('Roteiro não encontrado.', 404, 'NOT_FOUND');
  if (FEATURES.notifications) {
    try {
      await flushNotificationOutbox();
    } catch (error) {
      console.error('[notifications:flush-after-patch]', error);
    }
  }
  return getVisitRoute(id, user);
}

function civilIsoDate(date = new Date(), timeZone = 'America/Sao_Paulo') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function defaultHistoryRange() {
  const to = civilIsoDate();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 89);
  return { from: civilIsoDate(fromDate), to };
}

export function validateHistoryDate(value, fallback) {
  return DATE_PATTERN.test(String(value ?? '')) ? String(value) : fallback;
}
