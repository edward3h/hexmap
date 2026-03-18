// src/admin/users.ts
// User management page at /admin/users — superuser only.

import { api, ApiError } from './api';
import { AdminUser } from './types';
import { esc } from './utils';

export async function renderUsersPage(container: HTMLElement): Promise<void> {
  container.innerHTML = '<p style="padding:24px">Loading…</p>';

  let currentUser: AdminUser;
  try {
    currentUser = await api.get<AdminUser>('/auth/me');
  } catch {
    window.location.href = '/admin';
    return;
  }

  const isSuperuser = currentUser.roles.some((r) => r.role_type === 'superuser');
  if (!isSuperuser) {
    window.location.href = '/admin';
    return;
  }

  async function render(): Promise<void> {
    try {
      const users = await api.get<AdminUser[]>('/users');

      const rows = users
        .map((u) => {
          const gmRoles = u.roles.filter((r) => r.role_type === 'gm');
          const otherRoles = u.roles.filter((r) => r.role_type !== 'gm');

          const gmBadges = gmRoles
            .map(
              (r) => `
            <span style="display:inline-flex;align-items:center;gap:4px;background:#1e3a5f;border-radius:3px;padding:1px 6px;font-size:0.8em;margin:2px">
              GM #${r.campaign_id}
              <button data-remove-gm-user="${u.id}" data-remove-gm-campaign="${r.campaign_id}"
                style="background:none;border:none;color:#f87171;cursor:pointer;padding:0 2px;font-size:1em;line-height:1"
                title="Remove GM role">×</button>
            </span>`,
            )
            .join('');

          const otherBadges = otherRoles
            .map(
              (r) => `
            <span style="display:inline-block;background:#333;border-radius:3px;padding:1px 6px;font-size:0.8em;margin:2px;color:#aaa">
              ${esc(r.role_type)}${r.campaign_id ? ` #${r.campaign_id}` : ''}
            </span>`,
            )
            .join('');

          return `
          <tr style="border-bottom:1px solid #2a2a2a">
            <td style="padding:10px 12px">${esc(u.display_name)}</td>
            <td style="padding:10px 12px;color:#aaa;font-size:0.9em">${esc(u.email)}</td>
            <td style="padding:10px 12px">${gmBadges}${otherBadges}</td>
          </tr>`;
        })
        .join('');

      container.innerHTML = `
        <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;align-items:center;gap:16px">
          <a href="/admin" style="color:#7ab3f0">← Campaigns</a>
          <strong>Users</strong>
        </header>
        <main style="padding:24px;max-width:900px">
          <p style="color:#888;font-size:0.9em;margin:0 0 16px">${
            users.length
          } registered user${users.length === 1 ? '' : 's'}</p>
          <table style="width:100%;border-collapse:collapse;font-size:0.9em">
            <thead>
              <tr style="border-bottom:1px solid #444;text-align:left">
                <th style="padding:8px 12px">Name</th>
                <th style="padding:8px 12px">Email</th>
                <th style="padding:8px 12px">Roles</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </main>
      `;

      // Remove-GM buttons
      container
        .querySelectorAll<HTMLButtonElement>('button[data-remove-gm-user]')
        .forEach((btn) => {
          btn.addEventListener('click', () => {
            const userId = Number(btn.dataset['removeGmUser']);
            const campaignId = Number(btn.dataset['removeGmCampaign']);
            btn.disabled = true;
            void api
              .delete(`/campaigns/${campaignId}/gms/${userId}`)
              .then(() => render())
              .catch((err: unknown) => {
                // alert() is intentional — the user-table row has no inline error span.
                alert(
                  `Failed to remove GM: ${
                    err instanceof ApiError ? err.message : String(err)
                  }`,
                );
                btn.disabled = false;
              });
          });
        });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      container.innerHTML = `<p style="padding:24px;color:#f87171">Error: ${esc(
        String(err),
      )}</p>`;
    }
  }

  await render();
}
