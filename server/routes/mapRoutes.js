import { Router } from 'express';
import {
  getAgencyMapPoints,
  getCommercialSeatMapPoints,
  getStoreMapPoints,
  getStoreProductionHistory,
} from '../services/mapDataService.js';

const router = Router();
const STORE_POINTS_CACHE_MAX_ENTRIES = 120;
const storePointsCache = new Map();

function storePointsCacheTtlMs({ bbox, codAg, hierarchy }) {
  const hasAdditionalHierarchy = hierarchy && Object.entries(hierarchy)
    .some(([key, value]) => key !== 'codAg' && value != null);
  if (codAg) return 2 * 60_000;
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

function storePointsCacheKey({ bbox, limit, codAg, hierarchy, sortByCenter }) {
  return JSON.stringify({ bbox: roundedBbox(bbox), limit, codAg, hierarchy, sortByCenter });
}

function trimStorePointsCache() {
  while (storePointsCache.size > STORE_POINTS_CACHE_MAX_ENTRIES) {
    const oldestKey = storePointsCache.keys().next().value;
    if (!oldestKey) break;
    storePointsCache.delete(oldestKey);
  }
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
    const points = await getAgencyMapPoints({ bbox, limit, hierarchy });
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar agências:', error);
    res.status(500).json({ message: 'Erro ao buscar agências no SQL Server.' });
  }
});

function readCodAgFromQuery(query) {
  const codAg = String(query.codAg ?? '').trim();
  return codAg.length > 0 ? codAg : null;
}

router.get('/lojas', async (req, res) => {
  try {
    const bbox = readBboxFromQuery(req.query);
    const limit = readLimitFromQuery(req.query, null, 300000);
    const codAg = readCodAgFromQuery(req.query);
    const sortByCenter = String(req.query.sortByCenter ?? '').trim() === '1';
    const hierarchy = readHierarchyFromQuery(req.query);
    const options = { bbox, limit, codAg, hierarchy, sortByCenter };
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

router.get('/lojas/:chaveLoja/producao', async (req, res) => {
  try {
    const chaveLoja = String(req.params.chaveLoja ?? '').trim();
    if (!/^\d{1,18}$/.test(chaveLoja)) {
      res.status(400).json({ message: 'Parâmetro inválido: chaveLoja.' });
      return;
    }
    const history = await getStoreProductionHistory(chaveLoja);
    res.json({ history });
  } catch (error) {
    console.error('Erro ao buscar produção da loja:', error);
    res.status(500).json({ message: 'Erro ao buscar produção da loja no SQL Server.' });
  }
});

router.get('/sedes', async (req, res) => {
  try {
    const hierarchy = readHierarchyFromQuery(req.query);
    const points = await getCommercialSeatMapPoints({ hierarchy });
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar sedes da estrutura:', error);
    res.status(500).json({ message: 'Erro ao buscar sedes da estrutura comercial no SQL Server.' });
  }
});

export default router;
