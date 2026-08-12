export type Stage = "lead" | "proposal_sent" | "negotiating" | "won" | "lost";
export type InvoiceBasis = "time" | "fixed";
export type InvoiceStatus = "draft" | "sent" | "paid";

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
  invoice_id: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  amount_pence: number;
  basis: InvoiceBasis;
  status: InvoiceStatus;
  created_at: string;
}
