import { NextResponse } from "next/server";
import { assertServerEnv, env } from "@/lib/env";

const MONDAY_API_URL = "https://api.monday.com/v2";

async function postMonday<TResponse>(query: string, variables: Record<string, unknown>): Promise<TResponse> {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.mondayApiToken,
    },
    body: JSON.stringify({ query, variables }),
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

type BoardColumnsResponse = {
  boards: {
    id: string;
    name: string;
    columns: { id: string; title: string; type: string }[];
  }[];
};

const COLUMNS_QUERY = `
  query GetBoardColumns($boardIds: [ID!]!) {
    boards(ids: $boardIds) {
      id
      name
      columns {
        id
        title
        type
      }
    }
  }
`;

export async function GET() {
  assertServerEnv();

  const boardIds = [env.mondayDealsBoardId, env.mondayWorkOrdersBoardId]
    .filter(Boolean)
    .map(Number);

  const data = await postMonday<BoardColumnsResponse>(COLUMNS_QUERY, { boardIds });

  const result = data.boards.map((board) => ({
    boardId: board.id,
    boardName: board.name,
    columns: board.columns.map((col) => ({
      id: col.id,
      title: col.title,
      type: col.type,
    })),
  }));

  return NextResponse.json(result, { status: 200 });
}
