import { Router } from 'express';
import { requireFeature } from '../config/features.js';
import { sendApiError } from '../domain/apiError.js';
import { executeIdempotent } from '../services/idempotencyService.js';
import {
  checkinVisit,
  completeVisit,
  getHistory,
  getVisit,
  notCompleteVisit,
  rescheduleVisit,
  saveDraft,
  treatProduct,
} from '../services/visitsService.js';

const router = Router();
router.use(requireFeature('visits'));

function responseBody(req, visit) {
  return { visit, correlationId: req.correlationId };
}

function applyVersionHeader(res, visit) {
  if (visit?.rowVersion) res.set('ETag', `"${visit.rowVersion}"`);
}

async function mutation(req, res, scope, handler, successStatus = 200) {
  const result = await executeIdempotent(req, scope, async () => {
    const visit = await handler();
    return {
      status: successStatus,
      body: responseBody(req, visit),
    };
  });
  res.set('Idempotency-Replayed', result.replayed ? 'true' : 'false');
  applyVersionHeader(res, result.body.visit);
  res.status(result.status).json(result.body);
}

router.get('/:id/historico', async (req, res) => {
  try {
    const items = await getHistory(req.params.id, req.user, req.query.limit);
    res.json({ items, correlationId: req.correlationId });
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao consultar histórico da visita:');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const visit = await getVisit(req.params.id, req.user);
    applyVersionHeader(res, visit);
    res.json(responseBody(req, visit));
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao consultar visita:');
  }
});

router.patch('/:id/rascunho', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_RASCUNHO:${req.params.id}`, () =>
      saveDraft(req.params.id, req.body, req)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao salvar rascunho da visita:');
  }
});

router.post('/:id/checkins', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_CHECKIN:${req.params.id}`, () =>
      checkinVisit(req.params.id, req.body, req)
    , 201);
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao registrar check-in:');
  }
});

router.put('/:id/produtos/:productId', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_PRODUTO:${req.params.id}:${req.params.productId}`, () =>
      treatProduct(req.params.id, req.params.productId, req.body, req)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao tratar produto foco:');
  }
});

router.post('/:id/conclusao', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_CONCLUSAO:${req.params.id}`, () =>
      completeVisit(req.params.id, req.body, req)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao concluir visita:');
  }
});

router.post('/:id/nao-realizacao', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_NAO_REALIZADA:${req.params.id}`, () =>
      notCompleteVisit(req.params.id, req.body, req)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao registrar visita não realizada:');
  }
});

router.post('/:id/reagendamentos', async (req, res) => {
  try {
    await mutation(req, res, `VISITA_REAGENDAMENTO:${req.params.id}`, () =>
      rescheduleVisit(req.params.id, req.body, req)
    , 201);
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao reagendar visita:');
  }
});

export default router;
