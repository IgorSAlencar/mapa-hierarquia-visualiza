import { Router } from 'express';
import { getExpressoProductivityRows, getExpressoStateMetrics } from '../services/expressoService.js';

const router = Router();

router.get('/state-metrics', async (req, res) => {
  try {
    const ufSigla = String(req.query.ufSigla ?? '').toUpperCase();
    const codIbge = req.query.codIbge ? String(req.query.codIbge) : null;
    if (!ufSigla) {
      res.status(400).json({ message: 'Parâmetro obrigatório: ufSigla.' });
      return;
    }
    const metrics = await getExpressoStateMetrics({ ufSigla, codIbge });
    res.json({ metrics });
  } catch (error) {
    console.error('Erro ao buscar métricas Expresso por UF:', error);
    res.status(500).json({ message: 'Erro ao buscar métricas Expresso no SQL Server.' });
  }
});

router.get('/productivity-rows', async (req, res) => {
  try {
    const produtoId = String(req.query.produtoId ?? '').toLowerCase();
    const scope = req.query.scope === 'municipio' ? 'municipio' : 'estado';
    const ufSigla = req.query.ufSigla ? String(req.query.ufSigla).toUpperCase() : null;

    if (!produtoId) {
      res.status(400).json({ message: 'Parâmetro obrigatório: produtoId.' });
      return;
    }
    const rows = await getExpressoProductivityRows({ produtoId, scope, ufSigla });
    res.json({ rows });
  } catch (error) {
    console.error('Erro ao buscar produtividade Expresso:', error);
    res.status(500).json({ message: 'Erro ao buscar produtividade Expresso no SQL Server.' });
  }
});

export default router;
