// src/admin/api.ts
// Fetch wrapper that injects the Bearer token and handles 401 responses.

import { getToken, redirectToLogin } from './auth';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipContentType?: boolean } = {},
): Promise<T> {
  const token = getToken();
  const { skipContentType, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(skipContentType ? {} : { 'Content-Type': 'application/json' }),
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch('/api' + path, { ...fetchOptions, headers });

  if (response.status === 401) {
    redirectToLogin();
    throw new ApiError(401, 'Unauthorised');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Record<string, string>;
    throw new ApiError(response.status, body['error'] ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    apiFetch<T>(path, { method: 'POST', body: formData, skipContentType: true }),
};
