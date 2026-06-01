import { Router } from 'express';
import {
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
  if (!chaveGerenciaArea) {
    res.status(400).json({ message: 'Parâmetro chaveGerenciaArea inválido.' });
    return;
  }
  try {
    const items = await getCoordenacoesByGerenciaArea(chaveGerenciaArea);
    res.json({ items });
  } catch (error) {
    console.error('Erro ao buscar coordenações:', error);
    res.status(500).json({ message: 'Erro ao buscar coordenações.' });
  }
});

router.get('/supervisoes', async (req, res) => {
  const chaveCoordenacao = parsePositiveInt(req.query.chaveCoordenacao);
  if (!chaveCoordenacao) {
    res.status(400).json({ message: 'Parâmetro chaveCoordenacao inválido.' });
    return;
  }
  try {
    const items = await getSupervisoesByCoordenacao(chaveCoordenacao);
    res.json({ items });
  } catch (error) {
    console.error('Erro ao buscar supervisões:', error);
    res.status(500).json({ message: 'Erro ao buscar supervisões.' });
  }
});

export default router;
