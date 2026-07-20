import { Router } from 'express';
import {
  VisitRouteError,
  defaultHistoryRange,
  deleteVisitRoute,
  getAuthorizedRouteOwners,
  getVisitRoute,
  getVisitRouteSummary,
  listVisitRoutes,
  saveVisitRoute,
  validateHistoryDate,
} from '../services/visitRoutesService.js';

const router = Router();

function handleError(res, error, context) {
  const status = error instanceof VisitRouteError ? error.status : 500;
  if (status >= 500) console.error(context, error);
  res.status(status).json({
    message: status >= 500 ? 'Erro ao processar roteiros.' : error.message,
    code: error.code,
  });
}

function readRange(query) {
  const defaults = defaultHistoryRange();
  const from = validateHistoryDate(query.from, defaults.from);
  const to = validateHistoryDate(query.to, defaults.to);
  if (from > to) throw new VisitRouteError('Período do histórico inválido.');
  return { from, to };
}

function decodeCursor(value) {
  if (!value) return 0;
  try {
    const parsed = Number(Buffer.from(String(value), 'base64url').toString('utf8'));
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
  } catch { return 0; }
}

function encodeCursor(offset) {
  return offset == null ? null : Buffer.from(String(offset), 'utf8').toString('base64url');
}

router.get('/responsaveis', async (req, res) => {
  try {
    const rawKeys = req.query.chaveLoja;
    const storeKeys = Array.isArray(rawKeys)
      ? rawKeys
      : rawKeys != null && String(rawKeys).trim()
        ? [String(rawKeys)]
        : [];
    res.json({ items: await getAuthorizedRouteOwners(req.user, storeKeys) });
  } catch (error) { handleError(res, error, 'Erro ao listar responsáveis por roteiro:'); }
});

router.get('/resumo', async (req, res) => {
  try {
    const range = readRange(req.query);
    res.json({ items: await getVisitRouteSummary({ user: req.user, ...range }) });
  } catch (error) { handleError(res, error, 'Erro ao resumir roteiros:'); }
});

router.get('/', async (req, res) => {
  try {
    const range = readRange(req.query);
    const chaveSupervisao = Number(req.query.chaveSupervisao);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const result = await listVisitRoutes({
      user: req.user,
      ...range,
      chaveSupervisao: Number.isInteger(chaveSupervisao) && chaveSupervisao > 0 ? chaveSupervisao : null,
      offset: decodeCursor(req.query.cursor),
      limit,
    });
    res.json({ items: result.items, nextCursor: encodeCursor(result.nextOffset) });
  } catch (error) { handleError(res, error, 'Erro ao listar roteiros:'); }
});

router.post('/', async (req, res) => {
  try {
    const route = await saveVisitRoute(req.body, req.user);
    res.status(201).json({ route });
  } catch (error) { handleError(res, error, 'Erro ao salvar roteiro:'); }
});

router.get('/:id', async (req, res) => {
  try {
    res.json({ route: await getVisitRoute(req.params.id, req.user) });
  } catch (error) { handleError(res, error, 'Erro ao abrir roteiro:'); }
});

router.delete('/:id', async (req, res) => {
  try {
    res.json(await deleteVisitRoute(req.params.id, req.user));
  } catch (error) { handleError(res, error, 'Erro ao excluir roteiro:'); }
});

export default router;

