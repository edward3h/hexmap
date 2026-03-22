import './campaigns.css';

import { Campaign } from './campaignTypes';

const base = import.meta.env.BASE_URL;

const container = document.getElementById('campaign-list')!;

const heading = document.createElement('h1');
heading.textContent = 'Campaigns';
document.body.insertBefore(heading, container);

fetch('/api/campaigns')
  .then((res) => {
    if (!res.ok) throw new Error(`Failed to load campaigns (${res.status})`);
    return res.json() as Promise<Campaign[]>;
  })
  .then((campaigns) => {
    if (campaigns.length === 0) {
      container.innerHTML = '<p class="error-message">No campaigns found.</p>';
      return;
    }

    for (const campaign of campaigns) {
      const card = document.createElement('a');
      card.className = 'campaign-card';
      card.href = `${base}map/${campaign.id}`;

      const title = document.createElement('h2');
      title.textContent = campaign.name;
      card.appendChild(title);

      if (campaign.description) {
        const desc = document.createElement('p');
        desc.textContent = campaign.description;
        card.appendChild(desc);
      }

      const status = document.createElement('span');
      const state = campaign.ended_at
        ? 'ended'
        : !campaign.started_at
        ? 'not_started'
        : campaign.is_active
        ? 'active'
        : 'paused';
      const stateLabel: Record<string, string> = {
        not_started: 'Not Started',
        active: 'Active',
        paused: 'Paused',
        ended: 'Ended',
      };
      status.className = `status ${state.replace('_', '-')}`;
      status.textContent = stateLabel[state];
      card.appendChild(status);

      container.appendChild(card);
    }
  })
  .catch((err: Error) => {
    container.innerHTML = `<p class="error-message">${err.message}</p>`;
  });
