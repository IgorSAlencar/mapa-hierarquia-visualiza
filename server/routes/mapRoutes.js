import { Router } from 'express';
import { getAgencyMapPoints, getStoreMapPoints } from '../services/mapDataService.js';

const router = Router();

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
    direReg: parseIntField('direReg'),
    codGerReg: parseIntField('codGerReg'),
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

router.get('/lojas', async (req, res) => {
  try {
    const bbox = readBboxFromQuery(req.query);
    const limit = readLimitFromQuery(req.query, null, 300000);
    const points = await getStoreMapPoints({ bbox, limit });
    res.json({ points });
  } catch (error) {
    console.error('Erro ao buscar lojas:', error);
    res.status(500).json({ message: 'Erro ao buscar lojas no SQL Server.' });
  }
});

export default router;
