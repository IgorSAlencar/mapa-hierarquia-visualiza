import crypto from 'node:crypto';

const SESSION_COOKIE = 'map_session';
const SESSION_LIMIT = 5000;
const sessions = new Map();

function readCookie(cookieHeader, name) {
  const source = String(cookieHeader ?? '');
  for (const part of source.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function trimSessions() {
  while (sessions.size >= SESSION_LIMIT) {
    const oldestToken = sessions.keys().next().value;
    if (!oldestToken) break;
    sessions.delete(oldestToken);
  }
}

function createSession(user) {
  trimSessions();
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, {
    user,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  });
  return token;
}

function getSessionFromRequest(req) {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  session.lastSeenAt = Date.now();
  return { token, ...session };
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.AUTH_COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: String(process.env.AUTH_COOKIE_SECURE ?? 'false').toLowerCase() === 'true',
    path: '/',
  });
}

export {
  SESSION_COOKIE,
  createSession,
  getSessionFromRequest,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
};
