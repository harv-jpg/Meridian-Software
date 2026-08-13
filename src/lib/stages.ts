import type { Stage } from "./types";

// Class strings are written out in full rather than composed at runtime —
// Tailwind scans source text, so `bg-stage-${key}` would never be generated.
export interface StageMeta {
  key: Stage;
  label: string;
  /** Accent bar down the left edge of a card. */
  bar: string;
  /** Small status dot. */
  dot: string;
  /** Resting pill in the stage switcher. */
  chip: string;
  /** Selected pill in the stage switcher. */
  chipActive: string;
  /** Column tint while a card is dragged over it. */
  dropZone: string;
}

export const STAGE_META: Record<Stage, StageMeta> = {
  lead: {
    key: "lead",
    label: "Lead",
    bar: "bg-stage-lead",
    dot: "bg-stage-lead",
    chip: "border-stage-lead/30 bg-stage-lead/10 text-stage-lead hover:bg-stage-lead/20",
    chipActive: "border-stage-lead bg-stage-lead text-white",
    dropZone: "bg-stage-lead/10 ring-2 ring-stage-lead/40",
  },
  proposal_sent: {
    key: "proposal_sent",
    label: "Proposal Sent",
    bar: "bg-stage-proposal",
    dot: "bg-stage-proposal",
    chip: "border-stage-proposal/30 bg-stage-proposal/10 text-stage-proposal hover:bg-stage-proposal/20",
    chipActive: "border-stage-proposal bg-stage-proposal text-white",
    dropZone: "bg-stage-proposal/10 ring-2 ring-stage-proposal/40",
  },
  negotiating: {
    key: "negotiating",
    label: "Negotiating",
    bar: "bg-stage-negotiating",
    dot: "bg-stage-negotiating",
    chip: "border-stage-negotiating/30 bg-stage-negotiating/10 text-stage-negotiating hover:bg-stage-negotiating/20",
    chipActive: "border-stage-negotiating bg-stage-negotiating text-white",
    dropZone: "bg-stage-negotiating/10 ring-2 ring-stage-negotiating/40",
  },
  won: {
    key: "won",
    label: "Won",
    bar: "bg-stage-won",
    dot: "bg-stage-won",
    chip: "border-stage-won/30 bg-stage-won/10 text-stage-won hover:bg-stage-won/20",
    chipActive: "border-stage-won bg-stage-won text-white",
    dropZone: "bg-stage-won/10 ring-2 ring-stage-won/40",
  },
  lost: {
    key: "lost",
    label: "Lost",
    bar: "bg-stage-lost",
    dot: "bg-stage-lost",
    chip: "border-stage-lost/30 bg-stage-lost/10 text-stage-lost hover:bg-stage-lost/20",
    chipActive: "border-stage-lost bg-stage-lost text-white",
    dropZone: "bg-stage-lost/10 ring-2 ring-stage-lost/40",
  },
};

export const STAGE_ORDER: Stage[] = [
  "lead",
  "proposal_sent",
  "negotiating",
  "won",
  "lost",
];

export const STAGES: StageMeta[] = STAGE_ORDER.map((s) => STAGE_META[s]);

/** Stages that count as still in play, for pipeline totals. */
export const ACTIVE_STAGES: Stage[] = ["lead", "proposal_sent", "negotiating"];
