import crypto from 'node:crypto';
import { findEligibleUser, writeAuthLog } from '../repositories/authRepository.js';
import { ldapBind } from '../utils/ldap.js';
import { normalizeFuncional, toLdapUserFromNumeric } from '../utils/normalizeFuncional.js';

const FALLBACK_PASSWORD = process.env.AUTH_FALLBACK_PASSWORD || 'admin';

class AuthError extends Error {
  constructor(message, status = 401, reason = 'INVALID_CREDENTIALS') {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.reason = reason;
  }
}

function safePasswordEqual(received, expected) {
  const left = Buffer.from(String(received ?? ''), 'utf8');
  const right = Buffer.from(String(expected ?? ''), 'utf8');
  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, Buffer.alloc(right.length));
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function requestMetadata(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || null,
    userAgent: req.get('user-agent') || null,
  };
}

async function auditSafely(payload) {
  try {
    await writeAuthLog(payload);
  } catch (error) {
    console.warn('Não foi possível gravar AUTH_LOGS_MAPA:', error?.message || error);
  }
}

function publicUser(user) {
  return {
    funcional: user.funcional,
    nome: user.nome,
    email: user.email,
    role: user.role,
    isAdmin: user.isAdmin,
    scope: user.scope,
  };
}

export async function authenticateUser(rawFuncional, password, req) {
  const funcional = normalizeFuncional(rawFuncional, { maxLength: 7 });
  const metadata = requestMetadata(req);

  if (!/^\d{7}$/.test(funcional) || !password) {
    await auditSafely({
      funcional: funcional || null,
      action: 'LOGIN_FAILED',
      status: 'FAILURE',
      details: { reason: 'INVALID_INPUT' },
      ...metadata,
    });
    throw new AuthError('Funcional ou senha inválidos.', 401, 'INVALID_INPUT');
  }

  const user = await findEligibleUser(funcional);
  if (!user) {
    await auditSafely({
      funcional,
      action: 'LOGIN_FAILED',
      status: 'FAILURE',
      details: { reason: 'USER_NOT_AUTHORIZED' },
      ...metadata,
    });
    throw new AuthError('Funcional ou senha inválidos.', 401, 'USER_NOT_AUTHORIZED');
  }

  let method;
  if (safePasswordEqual(password, FALLBACK_PASSWORD)) {
    method = 'ADMIN_PASSWORD';
  } else {
    try {
      await ldapBind(toLdapUserFromNumeric(funcional), password);
      method = 'LDAP';
    } catch (error) {
      await auditSafely({
        funcional,
        action: 'LOGIN_FAILED',
        method: 'LDAP',
        status: 'FAILURE',
        details: { reason: error?.code || 'LDAP_AUTH_FAILED' },
        ...metadata,
      });
      throw new AuthError('Funcional ou senha inválidos.', 401, 'LDAP_AUTH_FAILED');
    }
  }

  const sessionUser = { ...publicUser(user), authMethod: method };
  await auditSafely({
    funcional,
    action: 'LOGIN',
    method,
    status: 'SUCCESS',
    ...metadata,
  });
  return sessionUser;
}

export async function auditLogout(user, req) {
  await auditSafely({
    funcional: user?.funcional ?? null,
    action: 'LOGOUT',
    method: user?.authMethod ?? null,
    status: 'SUCCESS',
    ...requestMetadata(req),
  });
}

export { AuthError, publicUser };
