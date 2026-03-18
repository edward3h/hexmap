// src/admin/types.ts
// Shared TypeScript interfaces for the admin SPA.
// All names carry the Admin prefix to avoid collisions with src/mapData.ts exports.

export interface AdminUserRole {
  role_type: 'superuser' | 'gm' | 'player';
  campaign_id: number;
  team_id: number;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  roles: AdminUserRole[];
}

export interface AdminCampaign {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface AdminTeam {
  name: string;
  display_name: string;
  color: string;
  assets: Record<string, number>;
}

export interface AdminTile {
  id: number;
  col: number;
  row: number;
  coord: string;
  locationName?: string;
  resourceName?: string;
  team?: string;
  defence?: number;
}

export interface AdminAttack {
  id: number;
  team: string;
  from: { col: number; row: number };
  to: { col: number; row: number };
}

export interface AdminMapData {
  teams: AdminTeam[];
  map: AdminTile[];
  attacks: AdminAttack[];
}

// user_id (not id) is intentional — distinguishes this projection from AdminUser.id
// at the call site. AdminGm is only used for the GMs-list endpoint response.
export interface AdminGm {
  user_id: number;
  display_name: string;
  email: string;
}
