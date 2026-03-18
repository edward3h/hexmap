// src/admin/campaign.ts
// Campaign detail page: tile editor, attack editor, team asset editor.

import { api, ApiError } from './api';
import { AdminAttack, AdminCampaign, AdminGm, AdminMapData, AdminUser } from './types';
import { esc } from './utils';

interface CampaignTeam {
  id: number;
  name: string;
  display_name: string;
  color: string;
}

interface CampaignDetailData {
  campaign: AdminCampaign;
  mapData: AdminMapData;
  teams: CampaignTeam[];
  gms: AdminGm[];
  currentUser: AdminUser;
}

async function loadData(campaignId: number): Promise<CampaignDetailData> {
  const [campaign, mapData, teams, gms, currentUser] = await Promise.all([
    api.get<AdminCampaign>(`/campaigns/${campaignId}`),
    api.get<AdminMapData>(`/campaigns/${campaignId}/map-data`),
    api.get<CampaignTeam[]>(`/campaigns/${campaignId}/teams`),
    api.get<AdminGm[]>(`/campaigns/${campaignId}/gms`),
    api.get<AdminUser>('/auth/me'),
  ]);
  return { campaign, mapData, teams, gms, currentUser };
}

type CampaignState = 'not_started' | 'active' | 'paused' | 'ended';

function getCampaignState(campaign: AdminCampaign): CampaignState {
  if (campaign.ended_at) return 'ended';
  if (!campaign.started_at) return 'not_started';
  if (campaign.is_active) return 'active';
  return 'paused';
}

function renderLifecycle(
  container: HTMLElement,
  campaign: AdminCampaign,
  campaignId: number,
  reload: () => void,
): void {
  const state = getCampaignState(campaign);
  const stateLabel: Record<CampaignState, string> = {
    not_started: 'Not Started',
    active: 'Active',
    paused: 'Paused',
    ended: 'Ended',
  };
  const stateColor: Record<CampaignState, string> = {
    not_started: '#888',
    active: '#4ade80',
    paused: '#fbbf24',
    ended: '#888',
  };

  interface ActionButton {
    label: string;
    action: string;
    bg: string;
  }
  const buttons: ActionButton[] = [];
  if (state === 'not_started')
    buttons.push({ label: 'Start', action: 'start', bg: '#166534' });
  if (state === 'active') {
    buttons.push({ label: 'Pause', action: 'pause', bg: '#92400e' });
    buttons.push({ label: 'End Campaign', action: 'end', bg: '#7f1d1d' });
  }
  if (state === 'paused') {
    buttons.push({ label: 'Resume', action: 'resume', bg: '#1d4ed8' });
    buttons.push({ label: 'End Campaign', action: 'end', bg: '#7f1d1d' });
  }

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Campaign Status</h3>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-weight:600;color:${stateColor[state]}">${stateLabel[state]}</span>
      ${buttons
        .map(
          (b) =>
            `<button data-action="${b.action}"
               style="padding:6px 14px;color:white;border:none;border-radius:3px;cursor:pointer;background:${
                 b.bg
               }">
               ${esc(b.label)}
             </button>`,
        )
        .join('')}
      <span id="lifecycle-error" style="color:#f87171;font-size:0.9em"></span>
    </div>
  `;

  container.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset['action']!;
      const errEl = document.getElementById('lifecycle-error');
      if (errEl) errEl.textContent = '';
      btn.disabled = true;
      void api
        .post(`/campaigns/${campaignId}/${action}`, {})
        .then(() => reload())
        .catch((err: unknown) => {
          if (errEl)
            errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
          btn.disabled = false;
        });
    });
  });
}

function renderCampaignSettings(
  container: HTMLElement,
  campaign: AdminCampaign,
  campaignId: number,
  reload: () => void,
): void {
  container.innerHTML = `
    <h3 style="margin:0 0 12px">Campaign Settings</h3>
    <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:0.9em">
        Name
        <input id="cs-name" type="text" value="${esc(campaign.name)}"
          style="padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:0.9em">
        Description
        <textarea id="cs-desc" rows="3"
          style="padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px;resize:vertical">${esc(
            campaign.description ?? '',
          )}</textarea>
      </label>
      <div style="display:flex;align-items:center;gap:12px">
        <button id="cs-save"
          style="padding:6px 16px;background:#444;color:white;border:none;border-radius:3px;cursor:pointer">
          Save
        </button>
        <span id="cs-feedback" style="font-size:0.9em"></span>
      </div>
    </div>
  `;

  document.getElementById('cs-save')?.addEventListener('click', () => {
    const nameVal = (document.getElementById('cs-name') as HTMLInputElement).value.trim();
    const descVal = (document.getElementById('cs-desc') as HTMLTextAreaElement).value;
    const feedback = document.getElementById('cs-feedback')!;
    const saveBtn = document.getElementById('cs-save') as HTMLButtonElement;

    if (!nameVal) {
      feedback.style.color = '#f87171';
      feedback.textContent = 'Name is required.';
      return;
    }

    saveBtn.disabled = true;
    feedback.textContent = '';

    void api
      .patch(`/campaigns/${campaignId}`, { name: nameVal, description: descVal })
      .then(() => reload())
      .catch((err: unknown) => {
        feedback.style.color = '#f87171';
        feedback.textContent = esc(err instanceof ApiError ? err.message : String(err));
        saveBtn.disabled = false;
      });
  });
}

function renderTeamManager(
  container: HTMLElement,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): void {
  const teamRows = teams
    .map(
      (t) => `
    <tr data-team-id="${t.id}">
      <td style="padding:6px 8px">
        <span class="team-view">${esc(t.name)}</span>
        <input class="team-edit-name" type="text" value="${esc(t.name)}"
          style="display:none;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 6px;border-radius:3px;width:120px">
      </td>
      <td style="padding:6px 8px">
        <span class="team-view">${esc(t.display_name)}</span>
        <input class="team-edit-display" type="text" value="${esc(t.display_name)}"
          style="display:none;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 6px;border-radius:3px;width:140px">
      </td>
      <td style="padding:6px 8px">
        <span class="team-view" style="display:inline-flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${esc(
            t.color,
          )}"></span>
          ${esc(t.color)}
        </span>
        <input class="team-edit-color" type="color" value="${esc(t.color)}"
          style="display:none;width:48px;height:28px;border:none;background:none;cursor:pointer">
      </td>
      <td style="padding:6px 8px;white-space:nowrap">
        <span class="team-view">
          <button class="team-edit-btn" style="padding:2px 8px;cursor:pointer;margin-right:4px">Edit</button>
          <button class="team-delete-btn" style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">Delete</button>
        </span>
        <span class="team-editing" style="display:none">
          <button class="team-save-btn" style="padding:2px 8px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px;margin-right:4px">Save</button>
          <button class="team-cancel-btn" style="padding:2px 8px;cursor:pointer">Cancel</button>
          <span class="team-edit-error" style="color:#f87171;font-size:0.85em;margin-left:6px"></span>
        </span>
        <span class="team-confirm-delete" style="display:none">
          Delete? <button class="team-confirm-btn" style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px;margin:0 4px">Confirm</button>
          <button class="team-cancel-delete-btn" style="padding:2px 8px;cursor:pointer">Cancel</button>
        </span>
      </td>
    </tr>`,
    )
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Teams</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-bottom:16px">
      <thead>
        <tr style="border-bottom:1px solid #444;text-align:left">
          <th style="padding:6px 8px">Name</th>
          <th style="padding:6px 8px">Display Name</th>
          <th style="padding:6px 8px">Colour</th>
          <th style="padding:6px 8px"></th>
        </tr>
      </thead>
      <tbody>${teamRows}</tbody>
    </table>
    <details>
      <summary style="cursor:pointer;color:#7ab3f0;margin-bottom:8px">+ Add team</summary>
      <div style="display:flex;flex-direction:column;gap:8px;max-width:400px;margin-top:8px">
        <input id="new-team-name" type="text" placeholder="Name (unique)"
          style="padding:6px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <input id="new-team-display" type="text" placeholder="Display name"
          style="padding:6px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.9em">
          Colour <input id="new-team-color" type="color" value="#888888"
            style="width:48px;height:28px;border:none;background:none;cursor:pointer">
        </label>
        <div style="display:flex;align-items:center;gap:12px">
          <button id="new-team-submit"
            style="padding:6px 14px;background:#1d4ed8;color:white;border:none;border-radius:3px;cursor:pointer">
            Create Team
          </button>
          <span id="new-team-error" style="color:#f87171;font-size:0.85em"></span>
        </div>
      </div>
    </details>
  `;

  // Edit / cancel / save per row
  container.querySelectorAll<HTMLTableRowElement>('tr[data-team-id]').forEach((row) => {
    const teamId = Number(row.dataset['teamId']);
    const viewEls = row.querySelectorAll<HTMLElement>('.team-view');
    const editingEl = row.querySelector<HTMLElement>('.team-editing')!;
    const confirmDeleteEl = row.querySelector<HTMLElement>('.team-confirm-delete')!;

    const showEdit = (): void => {
      viewEls.forEach((el) => (el.style.display = 'none'));
      editingEl.style.display = 'inline';
      row
        .querySelectorAll<HTMLInputElement>(
          '.team-edit-name,.team-edit-display,.team-edit-color',
        )
        .forEach((inp) => (inp.style.display = 'inline-block'));
    };
    const hideEdit = (): void => {
      viewEls.forEach((el) => (el.style.display = ''));
      editingEl.style.display = 'none';
      row
        .querySelectorAll<HTMLInputElement>(
          '.team-edit-name,.team-edit-display,.team-edit-color',
        )
        .forEach((inp) => (inp.style.display = 'none'));
    };

    row.querySelector('.team-edit-btn')?.addEventListener('click', showEdit);
    row.querySelector('.team-cancel-btn')?.addEventListener('click', hideEdit);

    row.querySelector('.team-save-btn')?.addEventListener('click', () => {
      const nameVal = (
        row.querySelector('.team-edit-name') as HTMLInputElement
      ).value.trim();
      const displayVal = (
        row.querySelector('.team-edit-display') as HTMLInputElement
      ).value.trim();
      const colorVal = (row.querySelector('.team-edit-color') as HTMLInputElement).value;
      const errEl = row.querySelector<HTMLElement>('.team-edit-error')!;
      errEl.textContent = '';

      if (!nameVal || !displayVal) {
        errEl.textContent = 'Name and display name are required.';
        return;
      }

      void api
        .patch(`/campaigns/${campaignId}/teams/${teamId}`, {
          name: nameVal,
          display_name: displayVal,
          color: colorVal,
        })
        .then(() => reload())
        .catch((err: unknown) => {
          errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
        });
    });

    row.querySelector('.team-delete-btn')?.addEventListener('click', () => {
      viewEls.forEach((el) => (el.style.display = 'none'));
      confirmDeleteEl.style.display = 'inline';
    });
    row.querySelector('.team-cancel-delete-btn')?.addEventListener('click', () => {
      viewEls.forEach((el) => (el.style.display = ''));
      confirmDeleteEl.style.display = 'none';
    });
    row.querySelector('.team-confirm-btn')?.addEventListener('click', () => {
      void api
        .delete(`/campaigns/${campaignId}/teams/${teamId}`)
        .then(() => reload())
        .catch((err: unknown) => {
          // alert() is intentional here — the confirm-delete row has no inline error span.
          // This mirrors the existing attack editor pattern (which also uses alert() for delete errors).
          alert(
            `Failed to delete team: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
          viewEls.forEach((el) => (el.style.display = ''));
          confirmDeleteEl.style.display = 'none';
        });
    });
  });

  // Add team form
  document.getElementById('new-team-submit')?.addEventListener('click', () => {
    const nameVal = (
      document.getElementById('new-team-name') as HTMLInputElement
    ).value.trim();
    const displayVal = (
      document.getElementById('new-team-display') as HTMLInputElement
    ).value.trim();
    const colorVal = (document.getElementById('new-team-color') as HTMLInputElement)
      .value;
    const errEl = document.getElementById('new-team-error')!;
    errEl.textContent = '';

    if (!nameVal || !displayVal) {
      errEl.textContent = 'Name and display name are required.';
      return;
    }

    void api
      .post(`/campaigns/${campaignId}/teams`, {
        name: nameVal,
        display_name: displayVal,
        color: colorVal,
      })
      .then(() => reload())
      .catch((err: unknown) => {
        errEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
      });
  });
}

function renderGmManager(
  container: HTMLElement,
  gms: AdminGm[],
  campaignId: number,
  reload: () => void,
): void {
  const gmRows = gms
    .map(
      (gm) => `
    <li style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333">
      <span>${esc(gm.display_name)} <span style="color:#888;font-size:0.85em">${esc(
        gm.email,
      )}</span></span>
      <button data-user-id="${gm.user_id}"
        style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px;font-size:0.85em">
        Remove
      </button>
    </li>`,
    )
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">GMs</h3>
    ${
      gms.length === 0
        ? '<p style="color:#888;font-size:0.9em">No GMs assigned yet.</p>'
        : `<ul style="list-style:none;padding:0;margin:0 0 16px">${gmRows}</ul>`
    }
    <div style="margin-top:12px">
      <div style="display:flex;gap:8px;align-items:flex-start;max-width:480px">
        <input id="gm-search-input" type="text" placeholder="Search by email or name (min 2 chars)"
          style="flex:1;padding:6px 8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:3px">
        <button id="gm-search-btn"
          style="padding:6px 12px;background:#444;color:white;border:none;border-radius:3px;cursor:pointer;white-space:nowrap">
          Search
        </button>
      </div>
      <ul id="gm-search-results" style="list-style:none;padding:0;margin:8px 0 0;max-width:480px"></ul>
      <span id="gm-search-error" style="color:#f87171;font-size:0.85em"></span>
    </div>
  `;

  // Remove GM buttons
  container.querySelectorAll<HTMLButtonElement>('button[data-user-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = Number(btn.dataset['userId']);
      btn.disabled = true;
      void api
        .delete(`/campaigns/${campaignId}/gms/${userId}`)
        .then(() => reload())
        .catch((err: unknown) => {
          // alert() is intentional — the Remove button row has no inline error span.
          alert(
            `Failed to remove GM: ${err instanceof ApiError ? err.message : String(err)}`,
          );
          btn.disabled = false;
        });
    });
  });

  // Search
  const searchInput = document.getElementById('gm-search-input') as HTMLInputElement;
  const searchResults = document.getElementById('gm-search-results')!;
  const searchError = document.getElementById('gm-search-error')!;

  interface UserResult {
    id: number;
    display_name: string;
    email: string;
  }

  const doSearch = (): void => {
    const q = searchInput.value.trim();
    searchError.textContent = '';
    searchResults.innerHTML = '';

    if (q.length < 2) {
      searchError.textContent = 'Enter at least 2 characters to search.';
      return;
    }

    void api
      .get<UserResult[]>(`/users/search?q=${encodeURIComponent(q)}`)
      .then((users) => {
        if (users.length === 0) {
          searchResults.innerHTML =
            '<li style="padding:6px 0;color:#888">No users found.</li>';
          return;
        }
        searchResults.innerHTML = users
          .map(
            (u) => `
          <li style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #333">
            <span>${esc(u.display_name)} <span style="color:#888;font-size:0.85em">${esc(
              u.email,
            )}</span></span>
            <button data-add-user-id="${u.id}"
              style="padding:2px 8px;cursor:pointer;background:#166534;color:white;border:none;border-radius:3px;font-size:0.85em">
              Add GM
            </button>
          </li>`,
          )
          .join('');

        searchResults
          .querySelectorAll<HTMLButtonElement>('button[data-add-user-id]')
          .forEach((btn) => {
            btn.addEventListener('click', () => {
              const userId = Number(btn.dataset['addUserId']);
              btn.disabled = true;
              void api
                .post(`/campaigns/${campaignId}/gms`, { user_id: userId })
                .then(() => reload())
                .catch((err: unknown) => {
                  searchError.textContent = esc(
                    err instanceof ApiError ? err.message : String(err),
                  );
                  btn.disabled = false;
                });
            });
          });
      })
      .catch((err: unknown) => {
        searchError.textContent = esc(
          err instanceof ApiError ? err.message : String(err),
        );
      });
  };

  document.getElementById('gm-search-btn')?.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

function renderTileEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
): void {
  const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

  const rows = mapData.map
    .map((tile) => {
      const selectedTeam = tile.team ? teamByName[tile.team] : null;
      const opts = teams
        .map(
          (t) =>
            `<option value="${t.id}" ${selectedTeam?.id === t.id ? 'selected' : ''}>${esc(
              t.display_name,
            )}</option>`,
        )
        .join('');

      return `<tr>
        <td style="padding:6px 8px;font-family:monospace">${esc(tile.coord)}</td>
        <td style="padding:6px 8px">${esc(tile.locationName ?? '')}</td>
        <td style="padding:6px 8px">${esc(tile.resourceName ?? '')}</td>
        <td style="padding:6px 8px">
          <select data-tile-id="${
            tile.id
          }" style="background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 4px;border-radius:3px">
            <option value="">— none —</option>
            ${opts}
          </select>
        </td>
      </tr>`;
    })
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Tiles</h3>
    <table style="width:100%;border-collapse:collapse;font-size:0.9em">
      <thead>
        <tr style="border-bottom:1px solid #444;text-align:left">
          <th style="padding:6px 8px">Coord</th>
          <th style="padding:6px 8px">Location</th>
          <th style="padding:6px 8px">Resource</th>
          <th style="padding:6px 8px">Team</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  container.querySelectorAll<HTMLSelectElement>('select[data-tile-id]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const tileId = Number(sel.dataset['tileId']);
      const teamId = sel.value ? Number(sel.value) : null;
      sel.disabled = true;
      void api
        .patch(`/campaigns/${campaignId}/tiles/${tileId}`, { team_id: teamId })
        .catch((err: unknown) => {
          alert(
            `Failed to update tile: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
        })
        .finally(() => {
          sel.disabled = false;
        });
    });
  });
}

function renderAttackEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
  reload: () => void,
): void {
  const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

  const attackRows = mapData.attacks
    .map((atk: AdminAttack) => {
      const team = teamByName[atk.team];
      return `<tr>
        <td style="padding:6px 8px">${esc(team?.display_name ?? atk.team)}</td>
        <td style="padding:6px 8px;font-family:monospace">${esc(
          `${atk.from.col},${atk.from.row}`,
        )}</td>
        <td style="padding:6px 8px;font-family:monospace">${esc(
          `${atk.to.col},${atk.to.row}`,
        )}</td>
        <td style="padding:6px 8px">
          <button data-attack-id="${atk.id}"
            style="padding:2px 8px;cursor:pointer;background:#7f1d1d;color:white;border:none;border-radius:3px">
            Resolve
          </button>
        </td>
      </tr>`;
    })
    .join('');

  const tileOptions = mapData.map
    .map(
      (t) =>
        `<option value="${t.id}">${esc(t.coord)}${
          t.locationName ? ' — ' + esc(t.locationName) : ''
        }</option>`,
    )
    .join('');
  const teamOptions = teams
    .map((t) => `<option value="${t.id}">${esc(t.display_name)}</option>`)
    .join('');

  container.innerHTML = `
    <h3 style="margin:0 0 12px">Attacks</h3>
    ${
      mapData.attacks.length === 0
        ? '<p style="color:#888">No active attacks.</p>'
        : `<table style="width:100%;border-collapse:collapse;font-size:0.9em;margin-bottom:16px">
          <thead><tr style="border-bottom:1px solid #444;text-align:left">
            <th style="padding:6px 8px">Team</th>
            <th style="padding:6px 8px">From</th>
            <th style="padding:6px 8px">To</th>
            <th style="padding:6px 8px"></th>
          </tr></thead>
          <tbody>${attackRows}</tbody>
        </table>`
    }
    <details style="margin-top:8px">
      <summary style="cursor:pointer;color:#7ab3f0;margin-bottom:8px">+ Add attack</summary>
      <div style="display:flex;flex-direction:column;gap:8px;max-width:360px;margin-top:8px">
        <label>Team
          <select id="atk-team" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${teamOptions}
          </select>
        </label>
        <label>From tile
          <select id="atk-from" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${tileOptions}
          </select>
        </label>
        <label>To tile
          <select id="atk-to" style="display:block;width:100%;margin-top:2px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:4px;border-radius:3px">
            ${tileOptions}
          </select>
        </label>
        <button id="atk-submit" style="padding:6px 16px;background:#1d4ed8;color:white;border:none;border-radius:3px;cursor:pointer;align-self:flex-start">
          Create Attack
        </button>
      </div>
    </details>
  `;

  container
    .querySelectorAll<HTMLButtonElement>('button[data-attack-id]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const attackId = Number(btn.dataset['attackId']);
        btn.disabled = true;
        void api
          .delete(`/campaigns/${campaignId}/attacks/${attackId}`)
          .then(() => reload())
          .catch((err: unknown) => {
            alert(
              `Failed to resolve attack: ${
                err instanceof ApiError ? err.message : String(err)
              }`,
            );
            btn.disabled = false;
          });
      });
    });

  document.getElementById('atk-submit')?.addEventListener('click', () => {
    const teamId = Number(
      (document.getElementById('atk-team') as HTMLSelectElement).value,
    );
    const fromId = Number(
      (document.getElementById('atk-from') as HTMLSelectElement).value,
    );
    const toId = Number((document.getElementById('atk-to') as HTMLSelectElement).value);
    if (fromId === toId) {
      alert('From and To tiles must differ.');
      return;
    }
    void api
      .post(`/campaigns/${campaignId}/attacks`, {
        team_id: teamId,
        from_tile_id: fromId,
        to_tile_id: toId,
      })
      .then(() => reload())
      .catch((err: unknown) => {
        alert(
          `Failed to create attack: ${
            err instanceof ApiError ? err.message : String(err)
          }`,
        );
      });
  });
}

function renderAssetEditor(
  container: HTMLElement,
  mapData: AdminMapData,
  teams: CampaignTeam[],
  campaignId: number,
): void {
  const teamById = Object.fromEntries(teams.map((t) => [t.name, t]));

  const teamSections = mapData.teams
    .map((teamData) => {
      const team = teamById[teamData.name];
      if (!team) return '';
      const assets = teamData.assets;
      const assetRows = Object.entries(assets)
        .map(
          ([name, value]) => `
          <tr>
            <td style="padding:4px 8px">${esc(name)}</td>
            <td style="padding:4px 8px">
              <input type="number" data-asset-name="${esc(name)}" value="${value}"
                style="width:70px;background:#2a2a2a;color:#eee;border:1px solid #555;padding:2px 4px;border-radius:3px">
            </td>
          </tr>`,
        )
        .join('');

      return `
        <div style="margin-bottom:20px">
          <h4 style="margin:0 0 6px;color:${esc(team.color)}">${esc(
        team.display_name,
      )}</h4>
          ${
            assetRows
              ? `<table style="font-size:0.9em;border-collapse:collapse">
              <thead><tr style="border-bottom:1px solid #444;text-align:left">
                <th style="padding:4px 8px">Asset</th><th style="padding:4px 8px">Score</th>
              </tr></thead>
              <tbody>${assetRows}</tbody>
            </table>
            <button data-team-id="${team.id}" style="margin-top:6px;padding:4px 12px;background:#166534;color:white;border:none;border-radius:3px;cursor:pointer">
              Save
            </button>`
              : '<p style="color:#888;font-size:0.9em">No assets.</p>'
          }
        </div>`;
    })
    .join('');

  container.innerHTML = `<h3 style="margin:0 0 12px">Team Assets</h3>${teamSections}`;

  container.querySelectorAll<HTMLButtonElement>('button[data-team-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const teamId = Number(btn.dataset['teamId']);
      const section = btn.closest('div')!;
      const payload: Record<string, number> = {};
      section
        .querySelectorAll<HTMLInputElement>('input[data-asset-name]')
        .forEach((inp) => {
          payload[inp.dataset['assetName']!] = Number(inp.value);
        });
      btn.disabled = true;
      void api
        .put(`/campaigns/${campaignId}/teams/${teamId}/assets`, payload)
        .then(() => {
          btn.textContent = 'Saved ✓';
          setTimeout(() => {
            btn.textContent = 'Save';
            btn.disabled = false;
          }, 1500);
        })
        .catch((err: unknown) => {
          alert(
            `Failed to save assets: ${
              err instanceof ApiError ? err.message : String(err)
            }`,
          );
          btn.disabled = false;
        });
    });
  });
}

export async function renderCampaignDetail(
  container: HTMLElement,
  campaignId: number,
): Promise<void> {
  container.innerHTML = '<p style="padding:24px">Loading…</p>';

  // render() re-fetches all data and rebuilds the full page.
  // Called after attack create/resolve to keep state consistent.
  async function render(): Promise<void> {
    try {
      const { campaign, mapData, teams, gms, currentUser } = await loadData(campaignId);

      container.innerHTML = `
        <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center">
          <span><a href="/admin" style="color:#7ab3f0">← Campaigns</a></span>
          <strong>${esc(campaign.name)}</strong>
          <span style="font-size:0.85em;color:${
            campaign.ended_at
              ? '#888'
              : campaign.started_at && campaign.is_active
              ? '#4ade80'
              : campaign.started_at
              ? '#fbbf24'
              : '#888'
          }">${
        campaign.ended_at
          ? 'Ended'
          : campaign.started_at && campaign.is_active
          ? 'Active'
          : campaign.started_at
          ? 'Paused'
          : 'Not Started'
      }</span>
        </header>
        <main style="padding:24px;max-width:900px;display:grid;gap:32px">
          <section id="section-lifecycle"></section>
          <section id="section-settings"></section>
          <section id="section-tiles"></section>
          <section id="section-attacks"></section>
          <section id="section-assets"></section>
          <section id="section-teams"></section>
          <section id="section-gms"></section>
        </main>
      `;

      renderTileEditor(
        document.getElementById('section-tiles')!,
        mapData,
        teams,
        campaignId,
      );
      renderAttackEditor(
        document.getElementById('section-attacks')!,
        mapData,
        teams,
        campaignId,
        () => void render(),
      );
      renderAssetEditor(
        document.getElementById('section-assets')!,
        mapData,
        teams,
        campaignId,
      );
      const isSuperuser = currentUser.roles.some((r) => r.role_type === 'superuser');

      renderLifecycle(
        document.getElementById('section-lifecycle')!,
        campaign,
        campaignId,
        () => void render(),
      );
      renderCampaignSettings(
        document.getElementById('section-settings')!,
        campaign,
        campaignId,
        () => void render(),
      );
      renderTeamManager(
        document.getElementById('section-teams')!,
        teams,
        campaignId,
        () => void render(),
      );
      if (isSuperuser) {
        renderGmManager(
          document.getElementById('section-gms')!,
          gms,
          campaignId,
          () => void render(),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      container.innerHTML = `<p style="padding:24px;color:#f87171">Error: ${esc(
        String(err),
      )}</p>`;
    }
  }

  await render();
}
