import { env } from "../env";
import type { MondayBoardConfig } from "./types";

export const dealsBoardConfig: MondayBoardConfig = {
  boardId: env.mondayDealsBoardId,
  sectorColumnId: "color_mm0yn39v",           // Sector/service
  amountColumnId: "numeric_mm0yt87d",          // Masked Deal value
  stageColumnId: "color_mm0ycn5z",             // Deal Stage
  dealStatusColumnId: "color_mm0yv4em",        // Deal Status
  closureProbabilityColumnId: "color_mm0y9keg",// Closure Probability
  clientCodeColumnId: "dropdown_mm0yvtfe",     // Client Code
  ownerCodeColumnId: "color_mm0yck2v",         // Owner code
  dateColumnId: "date_mm0ye7ts",               // Close Date (A)
  tentativeCloseDateColumnId: "date_mm0ybm73", // Tentative Close Date
  productDealColumnId: "color_mm0ymd7m",       // Product deal
  createdDateColumnId: "date_mm0yvhy9",        // Created Date
};

export const workOrdersBoardConfig: MondayBoardConfig = {
  boardId: env.mondayWorkOrdersBoardId,
  sectorColumnId: "color_mm0y9vrn",                  // Sector
  executionStatusColumnId: "color_mm0ybg3h",          // Execution Status
  natureOfWorkColumnId: "color_mm0y7x76",             // Nature of Work
  typeOfWorkColumnId: "color_mm0ydyye",               // Type of Work
  customerNameCodeColumnId: "dropdown_mm0y82tt",      // Customer Name Code
  poDateColumnId: "date_mm0y4gkw",                    // Date of PO/LOI
  probableStartDateColumnId: "date_mm0y8hp0",         // Probable Start Date
  probableEndDateColumnId: "date_mm0ye2a0",           // Probable End Date
  amountExclGstColumnId: "numeric_mm0y24f0",          // Amount in Rupees (Excl of GST)
  amountInclGstColumnId: "numeric_mm0y8c1h",          // Amount in Rupees (Incl of GST)
  billedValueExclGstColumnId: "numeric_mm0y9q7k",     // Billed Value (Excl of GST)
  billedValueInclGstColumnId: "numeric_mm0y3end",     // Billed Value (Incl of GST)
  collectedAmountColumnId: "numeric_mm0y6zgk",        // Collected Amount (Incl of GST)
  amountReceivableColumnId: "numeric_mm0yjpkr",       // Amount Receivable
  invoiceStatusColumnId: "color_mm0yk9jp",            // Invoice Status
  woStatusColumnId: "color_mm0y15f0",                 // WO Status (billed)
  // amountColumnId kept as amountExclGstColumnId alias for backward-compat with normalization
  amountColumnId: "numeric_mm0y24f0",
  statusColumnId: "color_mm0ybg3h",
  dateColumnId: "date_mm0y4gkw",
};

