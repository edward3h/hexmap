// src/admin/login.ts
// Renders the OAuth login page.

export function renderLogin(container: HTMLElement): void {
  const params = new URLSearchParams(window.location.search);
  const hasError = params.has('error');

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:16px">
      <h1 style="margin:0 0 8px">Hexmap Admin</h1>
      ${
        hasError
          ? `<p style="color:#f87171;margin:0">Login failed. Please try again.</p>`
          : ''
      }
      <a
        href="/api/auth/login?provider=discord"
        style="width:220px;padding:12px 24px;background:#5865F2;color:white;text-decoration:none;border-radius:6px;text-align:center;font-weight:600"
      >Sign in with Discord</a>
      <a
        href="/api/auth/login?provider=google"
        style="width:220px;padding:12px 24px;background:#ea4335;color:white;text-decoration:none;border-radius:6px;text-align:center;font-weight:600"
      >Sign in with Google</a>
    </div>
  `;
}
