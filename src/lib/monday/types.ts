export type MondayColumnValue = {
  id: string;
  text?: string | null;
  value?: string | null;
};

export type MondayItem = {
  id: string;
  name: string;
  column_values: MondayColumnValue[];
};

export type MondayItemsResponse = {
  items: MondayItem[];
};

export type DealFilters = {
  sector?: string;
  fromDate?: string; // ISO date
  toDate?: string; // ISO date
};

export type WorkOrderFilters = {
  sector?: string;
  fromDate?: string; // ISO date
  toDate?: string; // ISO date
};

export type MondayBoardConfig = {
  boardId: string;
  // Shared
  sectorColumnId?: string;
  // Deals columns
  amountColumnId?: string;
  stageColumnId?: string;
  dealStatusColumnId?: string;
  closureProbabilityColumnId?: string;
  clientCodeColumnId?: string;
  ownerCodeColumnId?: string;
  dateColumnId?: string;
  tentativeCloseDateColumnId?: string;
  productDealColumnId?: string;
  createdDateColumnId?: string;
  // Work Orders columns
  statusColumnId?: string;
  executionStatusColumnId?: string;
  natureOfWorkColumnId?: string;
  typeOfWorkColumnId?: string;
  customerNameCodeColumnId?: string;
  poDateColumnId?: string;
  probableStartDateColumnId?: string;
  probableEndDateColumnId?: string;
  amountExclGstColumnId?: string;
  amountInclGstColumnId?: string;
  billedValueExclGstColumnId?: string;
  billedValueInclGstColumnId?: string;
  collectedAmountColumnId?: string;
  amountReceivableColumnId?: string;
  invoiceStatusColumnId?: string;
  woStatusColumnId?: string;
  dealReferenceColumnId?: string;
};

