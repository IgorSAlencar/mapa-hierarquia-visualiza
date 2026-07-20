import { Router } from 'express';
import { requireAuth } from '../auth/authMiddleware.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
} from '../auth/sessionStore.js';
import { auditLogout, authenticateUser, publicUser } from '../services/authService.js';
import { normalizeFuncional } from '../utils/normalizeFuncional.js';

const router = Router();
const ATTEMPT_WINDOW_MS = 15 * 60_000;
const MAX_FAILED_ATTEMPTS = 10;
const attempts = new Map();

function attemptKey(req, funcional) {
  return `${req.ip || req.socket?.remoteAddress || 'unknown'}:${funcional || 'unknown'}`;
}

function currentAttempt(key) {
  const item = attempts.get(key);
  if (!item) return null;
  if (Date.now() - item.startedAt >= ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return item;
}

router.post('/login', async (req, res) => {
  const funcional = normalizeFuncional(req.body?.funcional, { maxLength: 7 });
  const key = attemptKey(req, funcional);
  const attempt = currentAttempt(key);
  if (attempt?.count >= MAX_FAILED_ATTEMPTS) {
    res.status(429).json({ message: 'Muitas tentativas. Aguarde alguns minutos.' });
    return;
  }

  try {
    const user = await authenticateUser(req.body?.funcional, req.body?.password, req);
    attempts.delete(key);
    const token = createSession(user);
    setSessionCookie(res, token);
    res.set('Cache-Control', 'no-store');
    res.json({ user: publicUser(user) });
  } catch (error) {
    const previous = currentAttempt(key);
    attempts.set(key, {
      count: (previous?.count ?? 0) + 1,
      startedAt: previous?.startedAt ?? Date.now(),
    });
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('Erro ao processar login:', error);
    res.status(status).json({
      message: status >= 500 ? 'Erro ao processar o login.' : error.message,
    });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', requireAuth, async (req, res) => {
  const user = req.user;
  destroySession(req.authSessionToken);
  clearSessionCookie(res);
  await auditLogout(user, req);
  res.status(204).end();
});

export default router;
