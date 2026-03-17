// src/admin/auth.ts
// Token storage and auth helpers for the admin SPA.

const TOKEN_KEY = 'hexmap_admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function redirectToLogin(): void {
  window.location.href = '/admin/login';
}

/**
 * Call on every /admin page load.
 * After OAuth callback, the PHP backend redirects to /admin#token=<token>.
 * This reads the token from the hash, stores it, then removes the hash from the URL.
 */
export function captureTokenFromHash(): void {
  const hash = window.location.hash;
  if (hash.startsWith('#token=')) {
    const token = decodeURIComponent(hash.slice(7));
    setToken(token);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
