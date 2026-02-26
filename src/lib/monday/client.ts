import { assertServerEnv, env } from "../env";
import type {
  DealFilters,
  MondayBoardConfig,
  MondayItem,
  MondayItemsResponse,
  WorkOrderFilters,
} from "./types";
import { dealsBoardConfig, workOrdersBoardConfig } from "./config";

const MONDAY_API_URL = "https://api.monday.com/v2";

async function postMonday<TResponse>(body: string): Promise<TResponse> {
  assertServerEnv();

  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.mondayApiToken,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`monday.com API error: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { data?: unknown; errors?: unknown };

  if (!json.data) {
    throw new Error(`monday.com API response missing data: ${JSON.stringify(json.errors)}`);
  }

  return json.data as TResponse;
}

function buildItemsQuery(boardConfig: MondayBoardConfig): string {
  return JSON.stringify({
    query: `
      query GetBoardItems($boardId: [ID!]!) {
        boards(ids: $boardId) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values {
                id
                text
                value
              }
            }
          }
        }
      }
    `,
    variables: {
      boardId: Number(boardConfig.boardId),
    },
  });
}

async function fetchBoardItems(boardConfig: MondayBoardConfig): Promise<MondayItem[]> {
  const body = buildItemsQuery(boardConfig);
  const data = await postMonday<{ boards: { items_page: { items: MondayItemsResponse["items"] } }[] }>(
    body,
  );

  const [board] = data.boards ?? [];
  return board?.items_page?.items ?? [];
}

export async function getDeals(filters: DealFilters = {}) {
  const rawItems = await fetchBoardItems(dealsBoardConfig);
  return { items: rawItems, filters, boardConfig: dealsBoardConfig };
}

export async function getWorkOrders(filters: WorkOrderFilters = {}) {
  const rawItems = await fetchBoardItems(workOrdersBoardConfig);
  return { items: rawItems, filters, boardConfig: workOrdersBoardConfig };
}

