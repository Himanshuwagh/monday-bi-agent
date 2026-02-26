export const env = {
  mondayApiToken: process.env.MONDAY_API_TOKEN ?? "",
  mondayDealsBoardId: process.env.MONDAY_DEALS_BOARD_ID ?? "",
  mondayWorkOrdersBoardId: process.env.MONDAY_WORK_ORDERS_BOARD_ID ?? "",
  claudeApiKey: process.env.CLAUDE_API_KEY ?? "",
  claudeModel: process.env.CLAUDE_MODEL ?? "claude-haiku-4-5",
};

export function assertServerEnv() {
  const missing: string[] = [];

  if (!env.mondayApiToken) missing.push("MONDAY_API_TOKEN");
  if (!env.mondayDealsBoardId) missing.push("MONDAY_DEALS_BOARD_ID");
  if (!env.mondayWorkOrdersBoardId) missing.push("MONDAY_WORK_ORDERS_BOARD_ID");
  if (!env.claudeApiKey) missing.push("CLAUDE_API_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

