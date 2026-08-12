export type Stage = "lead" | "proposal_sent" | "negotiating" | "won" | "lost";

export interface ClientRecord {
  id: string;
  name: string;
  stage: Stage;
  value_pence: number | null;
  notes: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  description: string | null;
  minutes: number;
  created_at: string;
}
