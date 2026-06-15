const DEFAULT_DEV_BASE_URL = 'http://192.168.15.3';

function normalizeBaseUrl(value) {
  const raw = (value ?? '').trim();
  if (!raw) {
    return new URL(DEFAULT_DEV_BASE_URL).origin;
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    const parsed = new URL(`http://${raw}`);
    return parsed.origin;
  }
}

export const DEV_API_PORT = Number(process.env.API_PORT ?? 3001);
export const DEV_BASE_URL = normalizeBaseUrl(process.env.DEV_BASE_URL);
export const DEV_FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 8080);
export const DEV_HOST = new URL(DEV_BASE_URL).hostname;

const apiPublic = new URL(DEV_BASE_URL);
apiPublic.port = String(DEV_API_PORT);
export const DEV_API_URL = apiPublic.origin;

/**
 * O Vite roda na mesma máquina que a API: o proxy usa loopback por padrão.
 * A API pública (rede) continua em DEV_API_URL (ex.: http://192.168.15.9:3001).
 */
export const DEV_API_PROXY_TARGET =
  (process.env.API_PROXY_TARGET ?? '').trim() || `http://127.0.0.1:${DEV_API_PORT}`;
