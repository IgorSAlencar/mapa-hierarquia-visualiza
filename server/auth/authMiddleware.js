import { getSessionFromRequest } from './sessionStore.js';

function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ message: 'Sessão ausente ou inválida.' });
    return;
  }

  req.authSessionToken = session.token;
  req.user = session.user;
  res.set('Cache-Control', 'private, no-store');
  next();
}

export { requireAuth };
