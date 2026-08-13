import type { ClientRecord } from "@/lib/types";
import { ACTIVE_STAGES, STAGES } from "@/lib/stages";
import { formatGBP } from "@/lib/format";

export default function RevenueSummary({ clients }: { clients: ClientRecord[] }) {
  const active = clients.filter((c) => ACTIVE_STAGES.includes(c.stage));
  const won = clients.filter((c) => c.stage === "won");
  const lost = clients.filter((c) => c.stage === "lost");

  const pipelineValue = active.reduce((sum, c) => sum + (c.value_pence ?? 0), 0);
  const wonValue = won.reduce((sum, c) => sum + (c.value_pence ?? 0), 0);

  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

  const stats = [
    {
      label: "Pipeline value",
      value: formatGBP(pipelineValue),
      hint: `${active.length} open`,
      accent: "text-ink",
    },
    {
      label: "Won value",
      value: formatGBP(wonValue),
      hint: `${won.length} closed`,
      accent: "text-teal",
    },
    {
      label: "Win rate",
      value: winRate === null ? "—" : `${winRate}%`,
      hint: decided > 0 ? `of ${decided} decided` : "none decided yet",
      accent: "text-ink",
    },
    {
      label: "Active clients",
      value: String(active.length),
      hint: `${clients.length} total`,
      accent: "text-ink",
    },
  ];

  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 transition hover:shadow-lift">
            <div className="label">{s.label}</div>
            <div
              className={`mt-1.5 font-mono text-2xl font-semibold tracking-tight ${s.accent}`}
            >
              {s.value}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">{s.hint}</div>
          </div>
        ))}
      </div>

      {clients.length > 0 && <StageBar clients={clients} />}
    </div>
  );
}

/** A single stacked bar showing how the book is distributed across stages. */
function StageBar({ clients }: { clients: ClientRecord[] }) {
  const segments = STAGES.map((s) => ({
    ...s,
    count: clients.filter((c) => c.stage === s.key).length,
  })).filter((s) => s.count > 0);

  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-ink/5">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.bar} transition-all duration-500`}
            style={{ width: `${(s.count / clients.length) * 100}%` }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 text-[11px] text-slate-500"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            {s.label}
            <span className="font-mono text-slate-400">{s.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
