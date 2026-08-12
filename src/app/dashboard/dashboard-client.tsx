"use client";

import { useState } from "react";
import PipelineBoard from "./pipeline-board";
import RevenueSummary from "./revenue-summary";
import type { ClientRecord } from "@/lib/types";

export default function DashboardClient({
  initialClients,
  userId,
}: {
  initialClients: ClientRecord[];
  userId: string;
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);

  return (
    <div>
      <RevenueSummary clients={clients} />
      <PipelineBoard clients={clients} setClients={setClients} userId={userId} />
    </div>
  );
}
