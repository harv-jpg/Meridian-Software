import type { InvoiceItem } from "./types";

/**
 * Quantities are stored in hundredths so half-hours and part-days survive
 * without floats — 150 means 1.5.
 *
 * This must round the same way `sync_invoice_total` does in the database
 * (`round(quantity_centi * unit_price_pence / 100.0)`), or the total shown
 * while editing will disagree with the total that gets stored. Both round
 * half away from zero for positive values, which is all we allow.
 */
export function lineTotalPence(
  item: Pick<InvoiceItem, "quantity_centi" | "unit_price_pence">
): number {
  return Math.round((item.quantity_centi * item.unit_price_pence) / 100);
}

export function itemsTotalPence(
  items: Pick<InvoiceItem, "quantity_centi" | "unit_price_pence">[]
): number {
  return items.reduce((sum, item) => sum + lineTotalPence(item), 0);
}

/** 150 -> "1.5", 100 -> "1", 25 -> "0.25" */
export function formatQuantity(quantityCenti: number): string {
  const n = quantityCenti / 100;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}

/** "1.5" -> 150. Returns null for anything that isn't a positive number. */
export function parseQuantity(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** "12.50" -> 1250. Returns null for anything that isn't zero or more. */
export function parsePricePence(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * VAT is derived from the net total and the rate rather than stored, so a
 * third column cannot fall out of step with the other two. Rates are in basis
 * points: 2000 means 20%.
 */
export function vatPence(netPence: number, vatRateBp: number): number {
  if (vatRateBp <= 0) return 0;
  return Math.round((netPence * vatRateBp) / 10000);
}

export function grossPence(netPence: number, vatRateBp: number): number {
  return netPence + vatPence(netPence, vatRateBp);
}

/** 2000 -> "20%", 1750 -> "17.5%" */
export function formatVatRate(vatRateBp: number): string {
  const pct = vatRateBp / 100;
  return `${Number.isInteger(pct) ? pct : parseFloat(pct.toFixed(2))}%`;
}

/** "20" -> 2000, "17.5" -> 1750. Null for anything not zero or more. */
export function parseVatRate(raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
