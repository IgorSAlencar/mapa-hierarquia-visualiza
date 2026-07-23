import { Router } from 'express';
import {
  getAgencyDetail,
  getAgencyMapPoints,
  getCommercialSeatDetail,
  getCommercialSeatMapPoints,
  getProductionHeatmap,
  getProductionHeatmapOptions,
  ProductionHeatmapError,
  getStoreMapPoints,
  getStoreProductionHistory,
} from '../services/mapDataService.js';
import { authCacheKey } from '../auth/scopeSql.js';
import { getAuthorizedSupervisionAreas } from '../services/supervisionAreasService.js';

const router = Router();
const STORE_POINTS_CACHE_MAX_ENTRIES = 120;
const storePointsCache = new Map();
const PRODUCTION_HEATMAP_CACHE_MAX_ENTRIES = 120;
const productionHeatmapCache = new Map();

router.get('/areas-supervisao', async (req, res) => {
  try {
    const featureCollection = await getAuthorizedSupervisionAreas(req.user);
    res.set('Cache-Control', 'private, max-age=300');
    res.json(featureCollection);
  } catch (error) {
    console.error('Erro ao carregar áreas de supervisão:', error);
    res.status(500).json({ message: 'Erro ao carregar áreas de supervisão.' });
  }
});

function storePointsCacheTtlMs({ bbox, codAg, hierarchy, search }) {
  const hasAdditionalHierarchy = hierarchy && Object.entries(hierarchy)
    .some(([key, value]) => key !== 'codAg' && value != null);
  if (codAg) return 2 * 60_000;
  if (search) return 60_000;
  if (bbox) return 30_000;
  if (hasAdditionalHierarchy) return 30_000;
  return 2 * 60_000;
}

function roundedBbox(bbox) {
  if (!bbox) return null;
  return Object.fromEntries(
    Object.entries(bbox).map(([key, value]) => [key, Number(Number(value).toFixed(5))])
  );
}

function storePointsCacheKey({ bbox, limit, codAg, hierarchy, sortByCenter, search, accessKey }) {
  return JSON.stringify({
    bbox: roundedBbox(bbox),
    limit,
    codAg,
    hierarchy,
    sortByCenter,
    search,
    accessKey,
  });
}

function trimStorePointsCache() {
  while (storePointsCache.size > STORE_POINTS_CACHE_MAX_ENTRIES) {
    const oldestKey = storePointsCache.keys().next().value;
    if (!oldestKey) break;
    storePointsCache.delete(oldestKey);
  }
}

function trimProductionHeatmapCache() {
  while (productionHeatmapCache.size > PRODUCTION_HEATMAP_CACHE_MAX_ENTRIES) {
    const oldestKey = productionHeatmapCache.keys().next().value;
    if (!oldestKey) break;
    productionHeatmapCache.delete(oldestKey);
  }
}

async function loadCachedProductionHeatmap(key, loader) {
  const now = Date.now();
  const cached = productionHeatmapCache.get(key);
  if (cached?.expiresAt > now) return cached.value ?? cached.promise;
  if (cached) productionHeatmapCache.delete(key);
  const promise = Promise.resolve(loader())
    .then((value) => {
      productionHeatmapCache.set(key, { expiresAt: Date.now() + 5 * 60_000, value });
      trimProductionHeatmapCache();
      return value;
    })
    .catch((error) => {
      productionHeatmapCache.delete(key);
      throw error;
    });
  productionHeatmapCache.set(key, { expiresAt: now + 5 * 60_000, promise });
  trimProductionHeatmapCache();
  return promise;
}

async function loadCachedStorePoints(key, ttlMs, loader) {
  if (ttlMs <= 0) return loader();
  const now = Date.now();
  const cached = storePointsCache.get(key);
  if (cached && cached.expiresAt > now) {
    storePointsCache.delete(key);
    storePointsCache.set(key, cached);
    return cached.promise ?? cached.points;
  }
  if (cached) storePointsCache.delete(key);

  const promise = Promise.resolve()
    .then(loader)
    .then((points) => {
      storePointsCache.set(key, { expiresAt: Date.now() + ttlMs, points });
      trimStorePointsCache();
      return points;
    })
    .catch((error) => {
      storePointsCache.delete(key);
      throw error;
    });

  storePointsCache.set(key, { expiresAt: now + ttlMs, promise });
  trimStorePointsCache();
  return promise;
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readBboxFromQuery(query) {
  const minLng = parseNumber(query.minLng);
  const minLat = parseNumber(query.minLat);
  const maxLng = parseNumber(query.maxLng);
  const maxLat = parseNumber(query.maxLat);

  if ([minLng, minLat, maxLng, maxLat].some((x) => x == null)) return null;
  return { minLng, minLat, maxLng, maxLat };
}

function readLimitFromQuery(query, fallback, maxAllowed) {
  const parsed = parseNumber(query.limit);
  if (parsed == null) return fallback;
  if (parsed <= 0) return null;
  return Math.min(Math.round(parsed), maxAllowed);
}

function readHierarchyFromQuery(query) {
  const parseIntField = (name) => {
    const n = parseNumber(query[name]);
    if (n == null) return null;
    return n > 0 ? Math.round(n) : null;
  };
  const hierarchy = {
    chaveGerenciaArea: parseIntField('chaveGerenciaArea'),
    chaveCoordenacao: parseIntField('chaveCoordenacao'),
    chaveSupervisao: parseIntField('chaveSupervisao'),
    // Compatibilidade temporária.
    codGerArea: parseIntField('codGerArea'),
    codCoord: parseIntField('codCoord'),
    codSupervisao: parseIntField('codSupervisao'),
    codAg: parseIntField('codAg'),
  };
  const hasAny = Object.values(hierarchy).some((v) => v != null);
  return hasAny ? hierarchy : null;
}

router.get('/agencias', async (req, res) => {
  try {
    const bbox = readBboxFromQuery(req.query);
    const limit = readLimitFromQuery(req.query, null, 250000);
    const hierarchy = readHierarchyFromQuery(req.query);
    const points = await getAgencyMapPoints({ bbox, limit, hierarchy, user: req.user });
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar agências:', error);
    res.status(500).json({ message: 'Erro ao buscar agências no SQL Server.' });
  }
});

router.get('/agencias/:codAg/detalhes', async (req, res) => {
  try {
    const codAg = String(req.params.codAg ?? '').trim();
    if (!/^\d{1,18}$/.test(codAg)) {
      res.status(400).json({ message: 'Parâmetro inválido: codAg.' });
      return;
    }

    const detail = await getAgencyDetail(codAg, req.user);
    if (!detail) {
      res.status(404).json({ message: 'Agência não encontrada.' });
      return;
    }
    res.json({ detail });
  } catch (error) {
    console.error('Erro ao buscar detalhes da agência:', error);
    res.status(500).json({ message: 'Erro ao buscar detalhes da agência no SQL Server.' });
  }
});

function readCodAgFromQuery(query) {
  const codAg = String(query.codAg ?? '').trim();
  return codAg.length > 0 ? codAg : null;
}

function readStoreSearchFromQuery(query) {
  const search = String(query.search ?? '').trim().replace(/\s+/g, ' ');
  return search.length > 0 ? search : null;
}

router.get('/lojas', async (req, res) => {
  try {
    const searchProvided = Object.prototype.hasOwnProperty.call(req.query, 'search');
    const search = readStoreSearchFromQuery(req.query);
    if (searchProvided && (!search || search.length < 2)) {
      res.json({ points: [] });
      return;
    }
    const bbox = readBboxFromQuery(req.query);
    const requestedLimit = readLimitFromQuery(req.query, search ? 20 : null, 300000);
    const limit = search ? Math.min(requestedLimit ?? 20, 50) : requestedLimit;
    const codAg = readCodAgFromQuery(req.query);
    const sortByCenter = String(req.query.sortByCenter ?? '').trim() === '1';
    const hierarchy = readHierarchyFromQuery(req.query);
    const options = {
      bbox,
      limit,
      codAg,
      hierarchy,
      sortByCenter,
      search,
      user: req.user,
      accessKey: authCacheKey(req.user),
    };
    const cacheTtlMs = storePointsCacheTtlMs(options);
    const cacheKey = storePointsCacheKey(options);
    const points = await loadCachedStorePoints(
      cacheKey,
      cacheTtlMs,
      () => getStoreMapPoints(options)
    );
    if (cacheTtlMs > 0) {
      res.set('Cache-Control', `private, max-age=${Math.max(1, Math.floor(cacheTtlMs / 1000))}`);
    }
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar lojas:', error);
    res.status(500).json({ message: 'Erro ao buscar lojas no SQL Server.' });
  }
});

router.get('/production-heatmap/options', async (_req, res) => {
  try {
    const options = await getProductionHeatmapOptions();
    res.set('Cache-Control', 'private, max-age=300');
    res.json(options);
  } catch (error) {
    console.error('Erro ao carregar opções do mapa de produção:', error);
    res.status(500).json({ message: 'Erro ao carregar opções do mapa de produção.' });
  }
});

router.get('/production-heatmap', async (req, res) => {
  try {
    const metricId = String(req.query.metricId ?? '').trim();
    const period = Number(req.query.period);
    const cacheKey = JSON.stringify({
      access: authCacheKey(req.user),
      metricId,
      period,
    });
    const data = await loadCachedProductionHeatmap(cacheKey, () =>
      getProductionHeatmap({ metricId, period, user: req.user })
    );
    res.set('Cache-Control', 'private, max-age=300');
    res.json(data);
  } catch (error) {
    if (error instanceof ProductionHeatmapError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    console.error('Erro ao carregar mapa de produção:', error);
    res.status(500).json({ message: 'Erro ao carregar mapa de produção.' });
  }
});

router.get('/lojas/:chaveLoja/producao', async (req, res) => {
  try {
    const chaveLoja = String(req.params.chaveLoja ?? '').trim();
    if (!/^\d{1,18}$/.test(chaveLoja)) {
      res.status(400).json({ message: 'Parâmetro inválido: chaveLoja.' });
      return;
    }
    const production = await getStoreProductionHistory(chaveLoja, req.user);
    if (production == null) {
      res.status(404).json({ message: 'Loja não encontrada.' });
      return;
    }
    res.json(production);
  } catch (error) {
    console.error('Erro ao buscar produção da loja:', error);
    res.status(500).json({ message: 'Erro ao buscar produção da loja no SQL Server.' });
  }
});

router.get('/sedes', async (req, res) => {
  try {
    const hierarchy = readHierarchyFromQuery(req.query);
    const points = await getCommercialSeatMapPoints({ hierarchy, user: req.user });
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar sedes da estrutura:', error);
    res.status(500).json({ message: 'Erro ao buscar sedes da estrutura comercial no SQL Server.' });
  }
});

router.get('/estrutura/:commercialLevel/:chaveEntidade/detalhes', async (req, res) => {
  try {
    const commercialLevel = String(req.params.commercialLevel ?? '').trim();
    const supportedLevels = new Set(['supervisor', 'coordenador', 'gerente_area']);
    const chaveEntidade = Number(req.params.chaveEntidade);
    if (!supportedLevels.has(commercialLevel) || !Number.isInteger(chaveEntidade) || chaveEntidade <= 0) {
      res.status(400).json({ message: 'Parâmetros inválidos para a estrutura comercial.' });
      return;
    }

    const detail = await getCommercialSeatDetail(commercialLevel, chaveEntidade, req.user);
    if (!detail) {
      res.status(404).json({ message: 'Responsável comercial não encontrado.' });
      return;
    }
    res.json({ detail });
  } catch (error) {
    console.error('Erro ao buscar detalhes da estrutura comercial:', error);
    res.status(500).json({ message: 'Erro ao buscar detalhes da estrutura comercial no SQL Server.' });
  }
});

export default router;
