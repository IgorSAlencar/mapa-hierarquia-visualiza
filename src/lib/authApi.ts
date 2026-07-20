const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export type AuthRole = 'admin' | 'gerente_area' | 'coordenador' | 'supervisor';

export interface AuthScope {
  gerenciasArea: number[];
  coordenacoes: number[];
  supervisoes: number[];
}

export interface AuthUser {
  funcional: string;
  nome: string;
  email: string | null;
  role: AuthRole;
  isAdmin: boolean;
  scope: AuthScope | null;
}

async function authFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
  });
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || `Erro ${response.status}`;
  } catch {
    return `Erro ${response.status}`;
  }
}

export async function loginRequest(funcional: string, password: string): Promise<AuthUser> {
  const response = await authFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ funcional, password }),
  });
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function currentUserRequest(): Promise<AuthUser | null> {
  const response = await authFetch('/api/auth/me');
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { user: AuthUser };
  return data.user;
}

export async function logoutRequest(): Promise<void> {
  const response = await authFetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error(await readError(response));
}
