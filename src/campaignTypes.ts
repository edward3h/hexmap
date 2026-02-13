interface Campaign {
  id: number;
  name: string;
  description: string | null;
  created_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  is_active: boolean;
}

export type { Campaign };
