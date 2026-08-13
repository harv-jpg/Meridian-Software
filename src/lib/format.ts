// Money is stored as integer pence everywhere; these are the only places it
// becomes a string. Previously each component had its own copy of this and
// they disagreed — some grouped thousands, some did not.

export function formatGBP(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return "—";
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Compact form for dense places like pipeline cards: £1,500 / £12.5k */
export function formatGBPShort(pence: number | null | undefined): string {
  if (pence === null || pence === undefined) return "—";
  const pounds = pence / 100;
  if (Math.abs(pounds) >= 1000) {
    const k = pounds / 1000;
    const rounded = Math.abs(k) >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
    return `£${rounded}k`;
  }
  return `£${pounds.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
