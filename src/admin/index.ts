// src/admin/index.ts
// Admin SPA entry point: captures OAuth token, routes to correct page.

import { api, ApiError } from './api';
import { captureTokenFromHash, clearToken, isLoggedIn, redirectToLogin } from './auth';
import { renderCampaignDetail } from './campaign';
import { renderLogin } from './login';
import { esc } from './utils';

interface UserRole {
  role_type: string;
  campaign_id: number;
  team_id: number;
}

interface User {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  roles: UserRole[];
}

interface Campaign {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p style="padding:24px">Loading…</p>';

  try {
    const [user, campaigns] = await Promise.all([
      api.get<User>('/auth/me'),
      api.get<Campaign[]>('/campaigns'),
    ]);

    const isSuperuser = user.roles.some((r) => r.role_type === 'superuser');
    const myCampaignIds = new Set(
      user.roles
        .filter((r) => r.role_type === 'gm' || r.role_type === 'player')
        .map((r) => r.campaign_id),
    );
    const visible = isSuperuser
      ? campaigns
      : campaigns.filter((c) => myCampaignIds.has(c.id));

    container.innerHTML = `
      <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
        <strong>Hexmap Admin</strong>
        <span>
          ${esc(user.display_name)}
          <button id="logout-btn" style="margin-left:12px;padding:4px 10px;cursor:pointer">Logout</button>
        </span>
      </header>
      <main style="padding:24px;max-width:800px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h2 style="margin:0">Campaigns</h2>
          <a href="/admin/campaigns/new" style="padding:8px 16px;background:#444;color:white;text-decoration:none;border-radius:4px">+ New Campaign</a>
        </div>
        ${
          visible.length === 0
            ? '<p>No campaigns yet. Create one to get started.</p>'
            : `<ul style="list-style:none;padding:0;margin:0">
            ${visible
              .map(
                (c) => `
              <li style="padding:14px 16px;border:1px solid #333;border-radius:6px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
                <a href="/admin/campaigns/${
                  c.id
                }" style="font-weight:600;text-decoration:none;color:#eee">${esc(
                  c.name,
                )}</a>
                <span style="font-size:0.85em;color:${
                  c.is_active ? '#4ade80' : '#888'
                }">${c.is_active ? 'Active' : 'Inactive'}</span>
              </li>`,
              )
              .join('')}
          </ul>`
        }
        ${
          isSuperuser
            ? '<p style="margin-top:24px"><a href="/admin/users">Manage users →</a></p>'
            : ''
        }
      </main>
    `;

    document.getElementById('logout-btn')?.addEventListener('click', () => {
      void api
        .post('/auth/logout', {})
        .catch(() => undefined)
        .then(() => {
          clearToken();
          redirectToLogin();
        });
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return; // redirectToLogin already called
    container.innerHTML = `<p style="padding:24px;color:#f87171">Error loading dashboard: ${esc(
      String(err),
    )}</p>`;
  }
}

async function route(): Promise<void> {
  // Must run before any auth check — captures token from OAuth redirect hash
  captureTokenFromHash();

  const app = document.getElementById('app');
  if (!app) return;

  const pathname = window.location.pathname.replace(/\/$/, '') || '/admin';

  if (pathname === '/admin/login') {
    renderLogin(app);
    return;
  }

  if (!isLoggedIn()) {
    redirectToLogin();
    return;
  }

  if (pathname === '/admin') {
    await renderDashboard(app);
    return;
  }

  const campaignMatch = /^\/admin\/campaigns\/(\d+)$/.exec(pathname);
  if (campaignMatch) {
    await renderCampaignDetail(app, Number(campaignMatch[1]));
    return;
  }

  // Placeholder for routes added in future phases
  app.innerHTML = `<p style="padding:24px">Page not yet implemented: <code>${pathname}</code></p>`;
}

route().catch(console.error);
