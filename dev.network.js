const DEFAULT_DEV_BASE_URL = 'http://192.168.15.4';

function normalizeBaseUrl(value) {
  const raw = (value ?? '').trim();
  if (!raw) {
    return DEFAULT_DEV_BASE_URL;
  }

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    const parsed = new URL(`http://${raw}`);
    return parsed.origin;
  }
}

export const DEV_BASE_URL = normalizeBaseUrl(process.env.DEV_BASE_URL);
export const DEV_API_PORT = Number(process.env.API_PORT ?? 3001);
export const DEV_FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 8080);
export const DEV_HOST = new URL(DEV_BASE_URL).hostname;
export const DEV_API_URL = `${DEV_BASE_URL}:${DEV_API_PORT}`;
