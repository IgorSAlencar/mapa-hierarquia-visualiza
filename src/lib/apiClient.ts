export const AUTH_EXPIRED_EVENT = 'mapa-auth-expired';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
  });
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  return response;
}
