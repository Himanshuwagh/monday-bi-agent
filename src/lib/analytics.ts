import type { NormalizedDeal, NormalizedWorkOrder } from "./normalization";

export type PipelineSummary = {
  totalOpenValue: number;
  openCount: number;
  byStage: Record<string, { count: number; value: number }>;
};

export type RevenueSummary = {
  totalWon: number;
  wonCount: number;
  averageDealSize: number | null;
};

export type SectorPerformance = {
  [sector: string]: {
    totalValue: number;
    dealCount: number;
    wonCount: number;
  };
};

export type JoinedDealWorkOrder = {
  deal: NormalizedDeal;
  workOrders: NormalizedWorkOrder[];
};

export function summarizePipeline(deals: NormalizedDeal[]): PipelineSummary {
  const byStage: PipelineSummary["byStage"] = {};
  let totalOpenValue = 0;
  let openCount = 0;

  for (const deal of deals) {
    const stage = deal.stage ?? "Unknown";
    const bucket = (byStage[stage] ??= { count: 0, value: 0 });
    bucket.count += 1;
    if (deal.amount != null) {
      bucket.value += deal.amount;
    }

    if (!stage.toLowerCase().includes("won") && !stage.toLowerCase().includes("lost")) {
      openCount += 1;
      if (deal.amount != null) {
        totalOpenValue += deal.amount;
      }
    }
  }

  return {
    totalOpenValue,
    openCount,
    byStage,
  };
}

export function summarizeRevenue(deals: NormalizedDeal[]): RevenueSummary {
  let totalWon = 0;
  let wonCount = 0;

  for (const deal of deals) {
    const stage = (deal.stage ?? "").toLowerCase();
    if (stage.includes("won") && deal.amount != null) {
      totalWon += deal.amount;
      wonCount += 1;
    }
  }

  return {
    totalWon,
    wonCount,
    averageDealSize: wonCount > 0 ? totalWon / wonCount : null,
  };
}

export function summarizeBySector(
  deals: NormalizedDeal[],
  workOrders: NormalizedWorkOrder[],
): SectorPerformance {
  const perf: SectorPerformance = {};

  for (const deal of deals) {
    const sector = deal.sector ?? "Unspecified";
    const bucket = (perf[sector] ??= { totalValue: 0, dealCount: 0, wonCount: 0 });
    bucket.dealCount += 1;
    if (deal.amount != null) bucket.totalValue += deal.amount;
    if ((deal.stage ?? "").toLowerCase().includes("won")) {
      bucket.wonCount += 1;
    }
  }

  // Work orders could be incorporated here later for utilization metrics.
  void workOrders;

  return perf;
}

export function joinDealsAndWorkOrders(
  deals: NormalizedDeal[],
  workOrders: NormalizedWorkOrder[],
): JoinedDealWorkOrder[] {
  const byDealName = new Map<string, NormalizedDeal>();
  for (const deal of deals) {
    byDealName.set(deal.name.toLowerCase(), deal);
  }

  const resultMap = new Map<string, JoinedDealWorkOrder>();

  for (const wo of workOrders) {
    const key = wo.name.toLowerCase();
    const deal = byDealName.get(key);
    if (!deal) continue;

    const existing = resultMap.get(deal.id) ?? { deal, workOrders: [] };
    existing.workOrders.push(wo);
    resultMap.set(deal.id, existing);
  }

  return Array.from(resultMap.values());
}

