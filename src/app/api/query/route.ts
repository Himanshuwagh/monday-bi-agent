import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { env, assertServerEnv } from "@/lib/env";
import { getDeals, getWorkOrders } from "@/lib/monday/client";
import type { DealFilters, WorkOrderFilters } from "@/lib/monday/types";
import {
  normalizeDealItem,
  normalizeWorkOrderItem,
  type NormalizedDeal,
  type NormalizedWorkOrder,
} from "@/lib/normalization";
import { dealsBoardConfig, workOrdersBoardConfig } from "@/lib/monday/config";

const anthropic = new Anthropic({
  apiKey: env.claudeApiKey,
});

/** Keep API costs down: limit context and tool payload size without hurting accuracy. */
const MAX_HISTORY_MESSAGES = 10;
const MAX_ASSISTANT_CHARS = 800;
const MAX_TOOL_ITEMS_PER_BOARD = 250;
const MAX_TOKENS_INITIAL = 1024;
const MAX_TOKENS_WITH_TOOLS = 2000;

const SYSTEM_PROMPT = `You are Pipeline Intel, a BI copilot for Skylark Drones founders. You answer business questions using live data from two monday.com boards via tools: get_deals(filters) and get_work_orders(filters).

DATA FIELDS
Deals: name, sector, stage, dealStatus, closureProbability, clientCode, ownerCode, amount (INR), closeDate, tentativeCloseDate, createdDate, productDeal.
Work Orders: name, sector, executionStatus, natureOfWork, typeOfWork, customerNameCode, amountExclGst, amountInclGst, billedValueExclGst, billedValueInclGst, collectedAmount, amountReceivable, poDate, probableStartDate, probableEndDate, invoiceStatus, woStatus.

ACTUAL SECTOR VALUES IN THE BOARDS (use these exact spellings in filters):
Deals board sectors: Aviation, Construction, DSP, Manufacturing, Mining, Others, Powerline, Railways, Renewables, Security and Surveillance, Tender.
Work Orders board sectors: use same list; map Energy/Renewables → "Renewables", Power → "Powerline".
When a user says "energy" or "renewable" → filter with sector=Renewables.
When a user says "power" or "powerline" → filter with sector=Powerline.

CRITICAL — CURRENCY (mistakes here are unacceptable):
All monetary fields are stored as RAW RUPEES (plain integers). You MUST convert before displaying.
  14680800  →  14680800 / 10000000  =  1.47  →  "Rs. 1.47 Cr"
   2446800  →   2446800 /   100000  = 24.47  →  "Rs. 24.47 L"
Rule: if converted value >= 1 → show in Cr. If < 1 → show in L.
For totals: sum all raw integers first, then divide the sum once — never sum already-converted numbers.
Sanity check: a typical Skylark deal is Rs. 5 L – Rs. 2 Cr. If one deal shows Rs. 100+ Cr, you made a conversion error — recheck.

CORE RULES
- Always call tools — never invent or guess data.
- Filters: pass sector/fromDate/toDate when the question implies them.
- Time: "this quarter" = Q1 2026 = Jan 1 to Mar 31 2026; "this year" = Jan–Dec 2026.
- Normalize sector spelling across both boards.
- Ask 1 clarifying question only when the query is truly ambiguous.
- If tool result includes "truncated": true, use totalCount for aggregate totals and note the sample size.

RESPONSE FORMAT — follow this every time, no exceptions:

**[One-line headline with the key number or verdict]**

Then use clearly separated sections with emoji markers:

📊 **Pipeline / Revenue / Status** — the core answer with 3–5 bullet points. Each bullet: one fact, one number, one implication. Bold every key figure.

🏆 **Top performers** (if relevant) — top 3 items with values, ranked.

⚡ **Action items** — 1–3 things the founder should do or watch. Short, directive.

⚠️ **Data caveats** (only if there are missing/bad fields) — one sentence per issue. Never skip this if quality issues exist.

FORMATTING RULES
- Bold all INR amounts, percentages, and counts: **Rs. 4.2 Cr**, **18 deals**, **62%**
- Never write walls of text. Max 2 sentences per bullet.
- Use a markdown table only when the user asks for a "breakdown", "comparison", or "table".
- For "detailed analysis" requests: expand each section with sub-bullets and add a summary table.
- For quick/default queries: keep total response under 200 words.
- No raw JSON. No jargon. Write for a founder who has 90 seconds.`.trim();

type ToolTraceEntry = {
  toolName: "get_deals" | "get_work_orders";
  filters: DealFilters | WorkOrderFilters;
  recordsReturned: number;
  issuesSummary: {
    totalItems: number;
    withIssues: number;
  };
};

type AgentRequestBody = {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
};

function buildBaseMessages(
  history: { role: "user" | "assistant"; content: string }[],
  message: string,
): Anthropic.Messages.MessageParam[] {
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  const mapped: Anthropic.Messages.MessageParam[] = trimmed.map((m) => {
    if (m.role === "assistant" && m.content.length > MAX_ASSISTANT_CHARS) {
      return { role: m.role, content: m.content.slice(0, MAX_ASSISTANT_CHARS) + "\n[...]" };
    }
    return { role: m.role, content: m.content };
  });
  return [...mapped, { role: "user", content: message }];
}

function friendlyErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("monday.com API") || msg.includes("401") || msg.includes("403")) {
    return "Could not reach monday.com. Check your API token and board access.";
  }
  if (msg.includes("500") || msg.includes("timeout")) {
    return "monday.com or the agent is temporarily unavailable. Try again in a bit.";
  }
  return "Something went wrong while answering. Please try again or rephrase your question.";
}

export async function POST(request: Request) {
  assertServerEnv();

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json(
      { answer: "Invalid request body.", toolTrace: [] },
      { status: 400 },
    );
  }

  const { message, history = [] } = body;
  const toolTrace: ToolTraceEntry[] = [];
  const baseMessages = buildBaseMessages(history, message);

  const tools: Anthropic.Messages.Tool[] = [
    {
      name: "get_deals",
      description: "Fetch deals from the monday.com Deals board.",
      input_schema: {
        type: "object",
        properties: {
          sector: { type: "string", description: "Normalized sector name, e.g. Energy" },
          fromDate: {
            type: "string",
            description: "Start date in ISO format (inclusive).",
          },
          toDate: {
            type: "string",
            description: "End date in ISO format (inclusive).",
          },
        },
      },
    },
    {
      name: "get_work_orders",
      description: "Fetch work orders from the monday.com Work Orders board.",
      input_schema: {
        type: "object",
        properties: {
          sector: { type: "string", description: "Normalized sector name, e.g. Energy" },
          fromDate: {
            type: "string",
            description: "Start date in ISO format (inclusive).",
          },
          toDate: {
            type: "string",
            description: "End date in ISO format (inclusive).",
          },
        },
      },
    },
  ];

  let initial: Awaited<ReturnType<typeof anthropic.messages.create>>;
  try {
    initial = await anthropic.messages.create({
      model: env.claudeModel,
      max_tokens: MAX_TOKENS_INITIAL,
      system: SYSTEM_PROMPT,
      messages: baseMessages,
      tools,
    });
  } catch (err) {
    return NextResponse.json({
      answer: friendlyErrorMessage(err),
      toolTrace: [],
    });
  }

  const toolUseEvents = initial.content.filter(
    (c) => c.type === "tool_use",
  ) as Anthropic.Messages.ToolUseBlock[];

  const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];

  if (toolUseEvents.length > 0) {
    for (const toolUse of toolUseEvents) {
      const args = (toolUse.input ?? {}) as DealFilters | WorkOrderFilters;

      try {
        if (toolUse.name === "get_deals") {
          const { items, filters, boardConfig } = await getDeals(args as DealFilters);
          let normalized: NormalizedDeal[] = items.map((item) =>
            normalizeDealItem(item, dealsBoardConfig ?? boardConfig),
          );
          // Apply in-memory filters
          if (filters.sector) {
            const s = filters.sector.toLowerCase();
            normalized = normalized.filter((d) => d.sector?.toLowerCase().includes(s));
          }
          if (filters.fromDate) {
            const from = new Date(filters.fromDate);
            normalized = normalized.filter((d) => (d.closeDate ?? d.tentativeCloseDate ?? d.createdDate ?? new Date(0)) >= from);
          }
          if (filters.toDate) {
            const to = new Date(filters.toDate);
            normalized = normalized.filter((d) => (d.closeDate ?? d.tentativeCloseDate ?? d.createdDate ?? new Date(9999999999999)) <= to);
          }
          const withIssues = normalized.filter((d) => d.issues.length > 0).length;
          toolTrace.push({
            toolName: "get_deals",
            filters,
            recordsReturned: normalized.length,
            issuesSummary: {
              totalItems: normalized.length,
              withIssues,
            },
          });
          const payload =
            normalized.length <= MAX_TOOL_ITEMS_PER_BOARD
              ? { items: normalized }
              : {
                items: normalized.slice(0, MAX_TOOL_ITEMS_PER_BOARD),
                totalCount: normalized.length,
                truncated: true,
              };
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          });
        } else if (toolUse.name === "get_work_orders") {
          const { items, filters, boardConfig } = await getWorkOrders(args as WorkOrderFilters);
          let normalized: NormalizedWorkOrder[] = items.map((item) =>
            normalizeWorkOrderItem(item, workOrdersBoardConfig ?? boardConfig),
          );
          // Apply in-memory filters
          if (filters.sector) {
            const s = filters.sector.toLowerCase();
            normalized = normalized.filter((d) => d.sector?.toLowerCase().includes(s));
          }
          if (filters.fromDate) {
            const from = new Date(filters.fromDate);
            normalized = normalized.filter((d) => (d.poDate ?? d.probableStartDate ?? new Date(0)) >= from);
          }
          if (filters.toDate) {
            const to = new Date(filters.toDate);
            normalized = normalized.filter((d) => (d.poDate ?? d.probableEndDate ?? new Date(9999999999999)) <= to);
          }
          const withIssues = normalized.filter((d) => d.issues.length > 0).length;
          toolTrace.push({
            toolName: "get_work_orders",
            filters,
            recordsReturned: normalized.length,
            issuesSummary: {
              totalItems: normalized.length,
              withIssues,
            },
          });
          const payload =
            normalized.length <= MAX_TOOL_ITEMS_PER_BOARD
              ? { items: normalized }
              : {
                items: normalized.slice(0, MAX_TOOL_ITEMS_PER_BOARD),
                totalCount: normalized.length,
                truncated: true,
              };
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: [{ type: "text", text: JSON.stringify(payload) }],
          });
        }
      } catch (err) {
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                message: friendlyErrorMessage(err),
              }),
            },
          ],
        });
      }
    }
  }

  let answer = "";

  if (toolResultBlocks.length === 0) {
    const textBlocks = initial.content.filter(
      (c) => c.type === "text",
    ) as Anthropic.Messages.TextBlock[];
    answer = textBlocks.map((b) => b.text).join("\n\n");
  } else {
    try {
      const second = await anthropic.messages.create({
        model: env.claudeModel,
        max_tokens: MAX_TOKENS_WITH_TOOLS,
        system: SYSTEM_PROMPT,
        messages: [
          ...baseMessages,
          { role: "assistant", content: initial.content },
          { role: "user", content: toolResultBlocks },
        ],
      });
      const textBlocks = second.content.filter(
        (c) => c.type === "text",
      ) as Anthropic.Messages.TextBlock[];
      answer = textBlocks.map((b) => b.text).join("\n\n");
    } catch (err) {
      answer =
        "We got the board data but couldn’t generate the answer. " +
        friendlyErrorMessage(err);
    }
  }

  return NextResponse.json({
    answer,
    toolTrace,
  });
}
