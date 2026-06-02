import { Router } from 'express';
import {
  getAllCoordenacoes,
  getAllSupervisoes,
  getCoordenacoesByGerenciaArea,
  getGerenciasArea,
  getSupervisoesByCoordenacao,
} from '../services/commercialStructureService.js';

const router = Router();

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

router.get('/gerencias-area', async (_req, res) => {
  try {
    const items = await getGerenciasArea();
    res.json({ items });
  } catch (error) {
    console.error('Erro ao buscar gerências de área:', error);
    res.status(500).json({ message: 'Erro ao buscar gerências de área.' });
  }
});

router.get('/coordenacoes', async (req, res) => {
  const chaveGerenciaArea = parsePositiveInt(req.query.chaveGerenciaArea);
  try {
    const items = chaveGerenciaArea
      ? await getCoordenacoesByGerenciaArea(chaveGerenciaArea)
      : await getAllCoordenacoes();
    res.json({ items });
  } catch (error) {
    console.error('Erro ao buscar coordenações:', error);
    res.status(500).json({ message: 'Erro ao buscar coordenações.' });
  }
});

router.get('/supervisoes', async (req, res) => {
  const chaveCoordenacao = parsePositiveInt(req.query.chaveCoordenacao);
  try {
    const items = chaveCoordenacao
      ? await getSupervisoesByCoordenacao(chaveCoordenacao)
      : await getAllSupervisoes();
    res.json({ items });
  } catch (error) {
    console.error('Erro ao buscar supervisões:', error);
    res.status(500).json({ message: 'Erro ao buscar supervisões.' });
  }
});

export default router;
