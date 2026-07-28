import { Router } from 'express';
import { requireFeature } from '../config/features.js';
import { sendApiError } from '../domain/apiError.js';
import { executeIdempotent } from '../services/idempotencyService.js';
import {
  executeNotificationAction,
  listNotifications,
  readAllNotifications,
  readNotification,
  snoozeNotification,
  unreadCount,
} from '../services/notificationsService.js';

const router = Router();
router.use(requireFeature('notifications'));

function applyVersion(res, notification) {
  if (notification?.rowVersion) res.set('ETag', `"${notification.rowVersion}"`);
}

async function mutation(req, res, scope, handler) {
  const result = await executeIdempotent(req, scope, async () => ({
    status: 200,
    body: {
      ...(await handler()),
      correlationId: req.correlationId,
    },
  }));
  res.set('Idempotency-Replayed', result.replayed ? 'true' : 'false');
  applyVersion(res, result.body.notification);
  res.status(result.status).json(result.body);
}

router.get('/contador', async (req, res) => {
  try {
    res.json({ unread: await unreadCount(req.user), correlationId: req.correlationId });
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao contar notificações:');
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await listNotifications(req.user, req.query);
    res.json({ ...result, correlationId: req.correlationId });
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao listar notificações:');
  }
});

router.patch('/:id/leitura', async (req, res) => {
  try {
    await mutation(req, res, `NOTIFICACAO_LEITURA:${req.params.id}`, async () => ({
      notification: await readNotification(req.params.id, req.user, req.get('If-Match')),
    }));
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao marcar notificação como lida:');
  }
});

router.post('/leitura-em-massa', async (req, res) => {
  try {
    await mutation(req, res, 'NOTIFICACAO_LEITURA_EM_MASSA', async () =>
      readAllNotifications(req.user)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao marcar notificações como lidas:');
  }
});

router.post('/:id/adiamento', async (req, res) => {
  try {
    await mutation(req, res, `NOTIFICACAO_ADIAMENTO:${req.params.id}`, async () => ({
      notification: await snoozeNotification(req.params.id, req.body, req),
    }));
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao adiar notificação:');
  }
});

router.post('/:id/acoes', async (req, res) => {
  try {
    await mutation(
      req,
      res,
      `NOTIFICACAO_ACAO:${req.params.id}:${String(req.body?.action ?? '').toUpperCase()}`,
      () => executeNotificationAction(req.params.id, req.body, req)
    );
  } catch (error) {
    sendApiError(res, error, req, 'Erro ao executar ação da notificação:');
  }
});

export default router;
