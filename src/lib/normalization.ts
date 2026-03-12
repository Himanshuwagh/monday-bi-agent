import type { MondayBoardConfig, MondayItem } from "./monday/types";

export type NormalizationIssue =
  | "missing_amount"
  | "missing_sector"
  | "missing_date"
  | "unparseable_amount"
  | "unparseable_date";

export type NormalizedDeal = {
  id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  dealStatus: string | null;
  closureProbability: string | null;
  clientCode: string | null;
  ownerCode: string | null;
  /** Raw Rupee integer as stored in monday.com */
  amount: number | null;
  /** Pre-converted to Crores (amount / 10,000,000) — use this for arithmetic */
  amountCr: number | null;
  /** Pre-formatted display string e.g. "Rs. 1.47 Cr" — use this for display */
  displayAmount: string | null;
  currency: string | null;
  closeDate: Date | null;
  tentativeCloseDate: Date | null;
  createdDate: Date | null;
  productDeal: string | null;
  issues: NormalizationIssue[];
};

export type NormalizedWorkOrder = {
  id: string;
  name: string;
  sector: string | null;
  executionStatus: string | null;
  natureOfWork: string | null;
  typeOfWork: string | null;
  customerNameCode: string | null;
  amountExclGst: number | null;
  amountInclGst: number | null;
  billedValueExclGst: number | null;
  billedValueInclGst: number | null;
  collectedAmount: number | null;
  amountReceivable: number | null;
  poDate: Date | null;
  probableStartDate: Date | null;
  probableEndDate: Date | null;
  invoiceStatus: string | null;
  woStatus: string | null;
  issues: NormalizationIssue[];
};

function getColumnValue(item: MondayItem, columnId?: string) {
  if (!columnId) return undefined;
  return item.column_values.find((cv) => cv.id === columnId);
}

/** Convert a raw Rupee number into a human-readable Cr/L string. */
export function formatInr(rawRupees: number): string {
  const cr = rawRupees / 10_000_000;
  if (cr >= 1) return `Rs. ${cr.toFixed(2)} Cr`;
  const l = rawRupees / 100_000;
  return `Rs. ${l.toFixed(2)} L`;
}

export function parseMoney(input: string | null | undefined) {
  if (!input) return { amount: null, amountCr: null as number | null, displayAmount: null as string | null, currency: null as string | null, issue: "missing_amount" as const };

  const cleaned = input.replace(/[, ]/g, "");
  const match = cleaned.match(/^([A-Za-z$€£¥])?(-?\d+(\.\d+)?)([kKmM])?$/);

  if (!match) {
    return { amount: null, amountCr: null as number | null, displayAmount: null as string | null, currency: null as string | null, issue: "unparseable_amount" as const };
  }

  const symbol = match[1] ?? null;
  const unit = parseFloat(match[2]);
  const suffix = match[4]?.toLowerCase();

  let multiplier = 1;
  if (suffix === "k") multiplier = 1_000;
  if (suffix === "m") multiplier = 1_000_000;

  const rawRupees = unit * multiplier;
  // Pre-convert to Crores so the LLM never has to do arithmetic on raw integers
  const amountCr = rawRupees / 10_000_000;
  const displayAmount = formatInr(rawRupees);

  return { amount: rawRupees, amountCr, displayAmount, currency: symbol, issue: null as NormalizationIssue | null };
}

export function parseDate(input: string | null | undefined) {
  if (!input) return { date: null as Date | null, issue: "missing_date" as const };

  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return { date: null as Date | null, issue: "unparseable_date" as const };
  }

  return { date: new Date(timestamp), issue: null as NormalizationIssue | null };
}

const SECTOR_ALIASES: Record<string, string> = {
  // Energy
  energy: "Energy",
  "energy sector": "Energy",
  "energy & utilities": "Energy",
  "energy and utilities": "Energy",
  utilities: "Energy",
  "oil & gas": "Oil & Gas",
  "oil and gas": "Oil & Gas",
  "o&g": "Oil & Gas",
  og: "Oil & Gas",
  // Agriculture
  agri: "Agriculture",
  agriculture: "Agriculture",
  agricultural: "Agriculture",
  "agri sector": "Agriculture",
  farming: "Agriculture",
  // Infrastructure
  infra: "Infrastructure",
  infrastructure: "Infrastructure",
  "infrastructure sector": "Infrastructure",
  // Government / Defense
  govt: "Government",
  gov: "Government",
  government: "Government",
  defense: "Defense",
  defence: "Defense",
  "govt & defense": "Government",
  // Telecom
  telecom: "Telecom",
  telco: "Telecom",
  telecommunications: "Telecom",
  // Mining
  mining: "Mining",
  mines: "Mining",
  // Power
  power: "Power",
  "power sector": "Power",
  "renewable energy": "Renewable Energy",
  renewables: "Renewable Energy",
  solar: "Renewable Energy",
  wind: "Renewable Energy",
  // Construction
  construction: "Construction",
  "real estate": "Real Estate",
  realty: "Real Estate",
  // Others
  logistics: "Logistics",
  transport: "Logistics",
};

export function normalizeSector(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return SECTOR_ALIASES[key] ?? raw.trim();
}

export function normalizeDealItem(
  item: MondayItem,
  config: MondayBoardConfig,
): NormalizedDeal {
  const sectorCv = getColumnValue(item, config.sectorColumnId);
  const amountCv = getColumnValue(item, config.amountColumnId);
  const stageCv = getColumnValue(item, config.stageColumnId);
  const dealStatusCv = getColumnValue(item, config.dealStatusColumnId);
  const closureProbCv = getColumnValue(item, config.closureProbabilityColumnId);
  const clientCodeCv = getColumnValue(item, config.clientCodeColumnId);
  const ownerCodeCv = getColumnValue(item, config.ownerCodeColumnId);
  const dateCv = getColumnValue(item, config.dateColumnId);
  const tentativeDateCv = getColumnValue(item, config.tentativeCloseDateColumnId);
  const createdDateCv = getColumnValue(item, config.createdDateColumnId);
  const productDealCv = getColumnValue(item, config.productDealColumnId);

  const issues: NormalizationIssue[] = [];

  const sector = normalizeSector(sectorCv?.text ?? null);
  if (!sector) issues.push("missing_sector");

  const money = parseMoney(amountCv?.text ?? null);
  if (money.issue) issues.push(money.issue);

  const date = parseDate(dateCv?.text ?? null);
  if (date.issue) issues.push(date.issue);

  const tentativeDate = parseDate(tentativeDateCv?.text ?? null);
  const createdDate = parseDate(createdDateCv?.text ?? null);

  return {
    id: item.id,
    name: item.name,
    sector,
    stage: stageCv?.text ?? null,
    dealStatus: dealStatusCv?.text ?? null,
    closureProbability: closureProbCv?.text ?? null,
    clientCode: clientCodeCv?.text ?? null,
    ownerCode: ownerCodeCv?.text ?? null,
    amount: money.amount,
    amountCr: money.amountCr,
    displayAmount: money.displayAmount,
    currency: money.currency,
    closeDate: date.date,
    tentativeCloseDate: tentativeDate.date,
    createdDate: createdDate.date,
    productDeal: productDealCv?.text ?? null,
    issues,
  };
}

function parseNumber(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[, ]/g, "");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function normalizeWorkOrderItem(
  item: MondayItem,
  config: MondayBoardConfig,
): NormalizedWorkOrder {
  const sectorCv = getColumnValue(item, config.sectorColumnId);
  const execStatusCv = getColumnValue(item, config.executionStatusColumnId ?? config.statusColumnId);
  const natureOfWorkCv = getColumnValue(item, config.natureOfWorkColumnId);
  const typeOfWorkCv = getColumnValue(item, config.typeOfWorkColumnId);
  const customerCv = getColumnValue(item, config.customerNameCodeColumnId);
  const poDateCv = getColumnValue(item, config.poDateColumnId ?? config.dateColumnId);
  const startDateCv = getColumnValue(item, config.probableStartDateColumnId);
  const endDateCv = getColumnValue(item, config.probableEndDateColumnId);
  const amtExclCv = getColumnValue(item, config.amountExclGstColumnId ?? config.amountColumnId);
  const amtInclCv = getColumnValue(item, config.amountInclGstColumnId);
  const billedExclCv = getColumnValue(item, config.billedValueExclGstColumnId);
  const billedInclCv = getColumnValue(item, config.billedValueInclGstColumnId);
  const collectedCv = getColumnValue(item, config.collectedAmountColumnId);
  const receivableCv = getColumnValue(item, config.amountReceivableColumnId);
  const invoiceStatusCv = getColumnValue(item, config.invoiceStatusColumnId);
  const woStatusCv = getColumnValue(item, config.woStatusColumnId);

  const issues: NormalizationIssue[] = [];

  const sector = normalizeSector(sectorCv?.text ?? null);
  if (!sector) issues.push("missing_sector");

  const amountExclGst = parseNumber(amtExclCv?.text);
  if (amountExclGst === null) issues.push("missing_amount");

  const poDate = parseDate(poDateCv?.text ?? null);
  if (poDate.issue) issues.push(poDate.issue);

  const probableStartDate = parseDate(startDateCv?.text ?? null);
  const probableEndDate = parseDate(endDateCv?.text ?? null);

  return {
    id: item.id,
    name: item.name,
    sector,
    executionStatus: execStatusCv?.text ?? null,
    natureOfWork: natureOfWorkCv?.text ?? null,
    typeOfWork: typeOfWorkCv?.text ?? null,
    customerNameCode: customerCv?.text ?? null,
    amountExclGst,
    amountInclGst: parseNumber(amtInclCv?.text),
    billedValueExclGst: parseNumber(billedExclCv?.text),
    billedValueInclGst: parseNumber(billedInclCv?.text),
    collectedAmount: parseNumber(collectedCv?.text),
    amountReceivable: parseNumber(receivableCv?.text),
    poDate: poDate.date,
    probableStartDate: probableStartDate.date,
    probableEndDate: probableEndDate.date,
    invoiceStatus: invoiceStatusCv?.text ?? null,
    woStatus: woStatusCv?.text ?? null,
    issues,
  };
}

