import type { ClientRecord } from "@/lib/types";

function formatGBP(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function RevenueSummary({ clients }: { clients: ClientRecord[] }) {
  const activeStages = ["lead", "proposal_sent", "negotiating"];

  const pipelineValue = clients
    .filter((c) => activeStages.includes(c.stage))
    .reduce((sum, c) => sum + (c.value_pence ?? 0), 0);

  const wonClients = clients.filter((c) => c.stage === "won");
  const lostClients = clients.filter((c) => c.stage === "lost");
  const wonValue = wonClients.reduce((sum, c) => sum + (c.value_pence ?? 0), 0);

  const decided = wonClients.length + lostClients.length;
  const winRate = decided > 0 ? Math.round((wonClients.length / decided) * 100) : null;

  const activeCount = clients.filter((c) => activeStages.includes(c.stage)).length;

  const stats = [
    { label: "Pipeline value", value: formatGBP(pipelineValue) },
    { label: "Won value", value: formatGBP(wonValue) },
    { label: "Win rate", value: winRate === null ? "—" : `${winRate}%` },
    { label: "Active clients", value: String(activeCount) },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded border border-ink/10 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {s.label}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
