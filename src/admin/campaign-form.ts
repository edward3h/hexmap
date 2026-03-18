// src/admin/campaign-form.ts
// Create-campaign form page at /admin/campaigns/new.

import { api, ApiError } from './api';
import { esc } from './utils';

export function renderCampaignForm(container: HTMLElement): void {
  container.innerHTML = `
    <header style="padding:16px 24px;border-bottom:1px solid #333;display:flex;align-items:center;gap:16px">
      <a href="/admin" style="color:#7ab3f0">← Campaigns</a>
      <strong>New Campaign</strong>
    </header>
    <main style="padding:24px;max-width:600px">
      <form id="campaign-form" style="display:flex;flex-direction:column;gap:16px">
        <label style="display:flex;flex-direction:column;gap:4px">
          Name <span style="color:#f87171;font-size:0.85em">*</span>
          <input id="cf-name" type="text" required
            style="padding:8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:4px;font-size:1em">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px">
          Description
          <textarea id="cf-desc" rows="4"
            style="padding:8px;background:#2a2a2a;color:#eee;border:1px solid #555;border-radius:4px;font-size:1em;resize:vertical"></textarea>
        </label>
        <div style="display:flex;align-items:center;gap:16px">
          <button type="submit" id="cf-submit"
            style="padding:8px 20px;background:#1d4ed8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:1em">
            Create Campaign
          </button>
          <span id="cf-error" style="color:#f87171;font-size:0.9em"></span>
        </div>
      </form>
    </main>
  `;

  const form = document.getElementById('campaign-form') as HTMLFormElement;
  const nameInput = document.getElementById('cf-name') as HTMLInputElement;
  const descInput = document.getElementById('cf-desc') as HTMLTextAreaElement;
  const submitBtn = document.getElementById('cf-submit') as HTMLButtonElement;
  const errorEl = document.getElementById('cf-error') as HTMLSpanElement;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;

    void api
      .post<{ id: number }>('/campaigns', {
        name: nameInput.value.trim(),
        description: descInput.value,
      })
      .then(({ id }) => {
        window.location.href = `/admin/campaigns/${id}`;
      })
      .catch((err: unknown) => {
        errorEl.textContent = esc(err instanceof ApiError ? err.message : String(err));
        submitBtn.disabled = false;
      });
  });
}
