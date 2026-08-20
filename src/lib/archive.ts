/** What deleting a client would take with it. */
export interface AttachedCounts {
  time: number;
  invoices: number;
  contracts: number;
  emails: number;
}

/**
 * "3 time entries, 1 invoice and 2 contracts", or null when nothing is
 * attached.
 *
 * Written out in full because a confirmation that says "and related records"
 * is one people click through without reading. Naming the numbers is what
 * makes the warning do any work.
 */
export function describeAttached(counts: AttachedCounts | undefined): string | null {
  if (!counts) return null;

  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(counts.time, "time entry", "time entries");
  add(counts.invoices, "invoice", "invoices");
  add(counts.contracts, "contract", "contracts");
  add(counts.emails, "filed email", "filed emails");

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
