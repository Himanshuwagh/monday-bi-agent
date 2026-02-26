"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ToolTraceEntry = {
  toolName: "get_deals" | "get_work_orders";
  filters: Record<string, string>;
  recordsReturned: number;
  issuesSummary: {
    totalItems: number;
    withIssues: number;
  };
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTraceEntry[]; // attached to each assistant message
};

type SavedSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  savedAt: number;
};

type BoardInfo = {
  boardId: string;
  boardName: string;
  boardUrl: string;
};

const THINKING_STEPS = [
  "Reading your question…",
  "Connecting to monday.com boards…",
  "Fetching live deal and work order data…",
  "Normalizing fields and cleaning messy values…",
  "Analyzing pipeline metrics and sector data…",
  "Composing your answer…",
];

const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000;
const STORAGE_KEY = "pipeline_intel_sessions";
const LAST_ACTIVE_KEY = "pipeline_intel_last_active";

function getTimestamp(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: SavedSession[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 20)));
  } catch { }
}

/* ──────────────────────────────────────────────────────────
   Inline Tool Trace Card
────────────────────────────────────────────────────────── */
function InlineTraceCard({
  trace,
  boards,
  messageId,
}: {
  trace: ToolTraceEntry[];
  boards: BoardInfo[];
  messageId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const dealsBoard = boards.find((b) => b.boardName.toLowerCase().includes("deal"));
  const workOrdersBoard = boards.find((b) => b.boardName.toLowerCase().includes("work"));

  const totalRows = trace.reduce((sum, t) => sum + t.recordsReturned, 0);
  const totalFlagged = trace.reduce((sum, t) => sum + t.issuesSummary.withIssues, 0);

  return (
    <div className="mb-2 ml-1 max-w-xl">
      {/* Collapsed pill / header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="group flex w-full items-center gap-2 rounded-xl border border-orange-200/70 bg-orange-50/60 px-3 py-2 text-left transition hover:border-orange-300 hover:bg-orange-50"
        aria-expanded={expanded}
        aria-controls={`trace-detail-${messageId}`}
      >
        {/* Animated dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
        </span>

        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
          <span className="font-semibold text-orange-700">
            {trace.length === 1 ? "1 board queried" : `${trace.length} boards queried`}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-600">
            {totalRows} rows fetched
          </span>
          {totalFlagged > 0 && (
            <>
              <span className="text-neutral-400">·</span>
              <span className="text-amber-600">{totalFlagged} rows flagged</span>
            </>
          )}
        </span>

        {/* Chevron */}
        <span
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div
          id={`trace-detail-${messageId}`}
          className="mt-1 overflow-hidden rounded-xl border border-orange-200/60 bg-white shadow-sm"
        >
          {trace.map((entry, i) => {
            const board =
              entry.toolName === "get_deals" ? dealsBoard : workOrdersBoard;
            const hasFilters = Object.entries(entry.filters ?? {}).some(([, v]) => v);
            const activeFilters = Object.entries(entry.filters ?? {})
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ");

            return (
              <div
                key={`${entry.toolName}-${i}`}
                className={`px-3 py-2.5 text-[11.5px] ${i > 0 ? "border-t border-neutral-100" : ""}`}
              >
                {/* Board name + row count */}
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* Board icon */}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-orange-100 text-orange-600">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.8" />
                        <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
                        <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.4" />
                        <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.2" />
                      </svg>
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {entry.toolName === "get_deals" ? "Deals board" : "Work Orders board"}
                    </span>
                    <span className="font-mono text-[10px] text-neutral-400">
                      {entry.toolName}
                    </span>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                    {entry.recordsReturned} rows
                  </span>
                </div>

                {/* Filters + quality row */}
                <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 pl-7 text-neutral-600">
                  <span className="font-medium text-neutral-400">Filters</span>
                  <span className={hasFilters ? "text-neutral-700" : "text-neutral-400 italic"}>
                    {hasFilters ? activeFilters : "none"}
                  </span>

                  <span className="font-medium text-neutral-400">Quality</span>
                  <span>
                    {entry.issuesSummary.withIssues === 0 ? (
                      <span className="text-emerald-600">✓ no issues</span>
                    ) : (
                      <span className="text-amber-600">
                        {entry.issuesSummary.withIssues}/{entry.issuesSummary.totalItems} rows have missing/bad fields
                      </span>
                    )}
                  </span>
                </div>

                {/* Board link */}
                {board && (
                  <div className="mt-2 pl-7">
                    <a
                      href={board.boardUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
                    >
                      {board.boardName}
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                        <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Main Page
────────────────────────────────────────────────────────── */
export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load sessions on mount
  useEffect(() => {
    const storedSessions = loadSessions();
    setSessions(storedSessions);

    const lastActive = parseInt(localStorage.getItem(LAST_ACTIVE_KEY) ?? "0", 10);
    const elapsed = Date.now() - lastActive;

    if (lastActive > 0 && elapsed < INACTIVITY_THRESHOLD_MS && storedSessions.length > 0) {
      const latest = storedSessions[0];
      setMessages(latest.messages);
      setActiveSessionId(latest.id);
    }
  }, []);

  // Update last-active timestamp
  useEffect(() => {
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading]);

  // Load connected monday boards
  useEffect(() => {
    async function loadBoards() {
      try {
        const res = await fetch("/api/debug-boards");
        if (!res.ok) return;
        const data = (await res.json()) as { boardId: string; boardName: string }[];
        setBoards(
          data.map((b) => ({
            boardId: b.boardId,
            boardName: b.boardName,
            boardUrl: `https://waghhimanshus-team.monday.com/boards/${b.boardId}`,
          })),
        );
      } catch { }
    }
    void loadBoards();
  }, []);

  // Thinking step animation
  useEffect(() => {
    if (isLoading) {
      setThinkingStep(0);
      thinkingTimerRef.current = setInterval(() => {
        setThinkingStep((prev) => Math.min(prev + 1, THINKING_STEPS.length - 1));
      }, 1400);
    } else {
      if (thinkingTimerRef.current) {
        clearInterval(thinkingTimerRef.current);
        thinkingTimerRef.current = null;
      }
      setThinkingStep(0);
    }
    return () => {
      if (thinkingTimerRef.current) clearInterval(thinkingTimerRef.current);
    };
  }, [isLoading]);

  const persistSession = useCallback(
    (msgs: ChatMessage[], sessionId: string) => {
      const title =
        msgs.find((m) => m.role === "user")?.content.slice(0, 48) ?? "New conversation";
      const updated: SavedSession = {
        id: sessionId,
        title,
        messages: msgs,
        savedAt: Date.now(),
      };
      setSessions((prev) => {
        const next = [updated, ...prev.filter((s) => s.id !== sessionId)];
        saveSessions(next);
        return next;
      });
    },
    [],
  );

  function startNewChat() {
    setMessages([]);
    setInput("");
    setActiveSessionId(null);
  }

  function openSession(session: SavedSession) {
    setMessages(session.messages);
    setActiveSessionId(session.id);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const sessionId = activeSessionId ?? crypto.randomUUID();
    if (!activeSessionId) setActiveSessionId(sessionId);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) throw new Error("The agent returned an error. Please try again.");

      const data = (await res.json()) as {
        answer: string;
        toolTrace: ToolTraceEntry[];
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        toolTrace: data.toolTrace ?? [],
      };

      const finalMessages = [...nextMessages, assistantMessage];
      setMessages(finalMessages);
      persistSession(finalMessages, sessionId);
    } catch (error) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "Something went wrong while contacting the agent.",
      };
      const finalMessages = [...nextMessages, assistantMessage];
      setMessages(finalMessages);
      persistSession(finalMessages, sessionId);
    } finally {
      setIsLoading(false);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-white text-neutral-900">
      {/* ── Left Sidebar ── */}
      <aside className="flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-neutral-200 bg-neutral-900 px-4 py-6">
        <div className="mb-6">
          <a
            href="https://skylarkdrones.com"
            target="_blank"
            rel="noreferrer"
            className="block opacity-90 transition hover:opacity-100"
          >
            <div className="text-sm font-bold tracking-tight text-white">Skylark Drones</div>
            <div className="mt-0.5 text-xs font-medium uppercase tracking-wider text-orange-400">
              Pipeline Intel
            </div>
          </a>
        </div>

        <nav className="space-y-1 text-sm">
          <button
            type="button"
            onClick={startNewChat}
            className="w-full rounded-lg bg-orange-500 px-3 py-2 text-left font-medium text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
          >
            + New Chat
          </button>
          <p className="px-1 pt-1 text-[11px] text-neutral-400">
            Concise answers by default. Say &quot;detailed analysis&quot; for more.
          </p>
        </nav>

        {sessions.length > 0 && (
          <div className="mt-6 flex-1 overflow-hidden">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Recent
            </div>
            <div className="space-y-1 overflow-y-auto pr-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openSession(s)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 ${s.id === activeSessionId
                    ? "border-orange-500/50 bg-orange-500/10 text-neutral-100"
                    : "border-neutral-700 bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800"
                    }`}
                >
                  <div className="truncate text-xs">{s.title}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-500">
                    {getTimestamp(s.savedAt)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto border-t border-neutral-700 pt-4 text-xs text-neutral-500">
          <div className="mt-2 text-[11px] text-neutral-400">
            Live data from <span className="font-medium text-neutral-300">monday.com</span>
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header with board quick-links */}
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 lg:px-8">
          <div>
            <h1 className="text-base font-semibold text-neutral-900">Pipeline Intel</h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              Executive answers from live monday.com · Powered by Skylark Drones
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Board quick-links */}
            {boards.map((b) => (
              <a
                key={b.boardId}
                href={b.boardUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                {b.boardName}
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                  <path d="M2 10L10 2M10 2H5M10 2v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
            <button
              type="button"
              onClick={startNewChat}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
            >
              New chat
            </button>
          </div>
        </header>

        {/* Chat area — full width */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 py-4 lg:px-8 lg:py-6">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:p-6">
            {/* Empty state */}
            {!hasMessages ? (
              <div className="flex flex-1 flex-col items-start justify-center gap-8 overflow-y-auto px-2 lg:px-4">
                <div className="max-w-lg">
                  <h2 className="text-2xl font-semibold text-neutral-900">
                    Ask one business question
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-neutral-500">
                    Get a short executive brief by default. Add &quot;detailed analysis&quot; when you need a deeper breakdown.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {boards.map((b) => (
                      <a
                        key={b.boardId}
                        href={b.boardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                        {b.boardName} ↗
                      </a>
                    ))}
                  </div>
                </div>

                {/* How it works */}
                <div className="grid w-full gap-3 text-xs text-neutral-600 sm:grid-cols-3">
                  {[
                    "1) Ask about pipeline, revenue, sectors, or work orders",
                    "2) We pull live monday.com data and check quality",
                    "3) Get a concise, decision-ready answer with full source trace",
                  ].map((step) => (
                    <div
                      key={step}
                      className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5"
                    >
                      {step}
                    </div>
                  ))}
                </div>

                {/* Example queries */}
                <div className="grid w-full gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    "How's our energy pipeline this quarter?",
                    "Which work orders are at risk of delay?",
                    "Give detailed analysis of top customers this month.",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setInput(example)}
                      className="h-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-left text-neutral-700 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message list */
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1">
                {messages.map((m) => (
                  <div key={m.id}>
                    {m.role === "user" ? (
                      /* User bubble */
                      <div className="flex justify-end">
                        <div className="max-w-xl rounded-2xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-sm">
                          <p>{m.content}</p>
                        </div>
                      </div>
                    ) : (
                      /* Assistant: trace card → then reply bubble */
                      <div className="flex flex-col gap-1.5">
                        {/* Inline tool trace */}
                        {m.toolTrace && m.toolTrace.length > 0 && (
                          <InlineTraceCard
                            trace={m.toolTrace}
                            boards={boards}
                            messageId={m.id}
                          />
                        )}

                        {/* Answer bubble */}
                        <div className="flex justify-start">
                          <div className="max-w-xl rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm shadow-sm">
                            <div className="markdown-response space-y-1 leading-relaxed text-neutral-900">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {m.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Thinking animation */}
                {isLoading && (
                  <div className="flex flex-col gap-1.5">
                    {/* Thinking trace skeleton */}
                    <div className="ml-1 flex max-w-xl animate-pulse items-center gap-2 rounded-xl border border-orange-200/60 bg-orange-50/60 px-3 py-2">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                      </span>
                      <span className="text-[12px] font-medium text-orange-600">
                        Querying monday.com boards…
                      </span>
                    </div>

                    {/* Thinking steps */}
                    <div className="flex justify-start">
                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 shadow-sm">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
                          <span className="text-xs font-medium text-neutral-500">
                            Agent is thinking
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {THINKING_STEPS.map((step, i) => (
                            <div
                              key={step}
                              className={`flex items-center gap-2 text-xs transition-all duration-300 ${i < thinkingStep
                                ? "text-orange-600"
                                : i === thinkingStep
                                  ? "text-neutral-700"
                                  : "text-neutral-300"
                                }`}
                            >
                              <span
                                className={`inline-block h-1 w-1 shrink-0 rounded-full ${i < thinkingStep
                                  ? "bg-orange-500"
                                  : i === thinkingStep
                                    ? "animate-pulse bg-neutral-400"
                                    : "bg-neutral-200"
                                  }`}
                              />
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Input — fixed at bottom */}
            <div className="mt-4 shrink-0">
              <form
                onSubmit={handleSubmit}
                className="relative rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow focus-within:border-orange-300 focus-within:shadow-md focus-within:shadow-orange-100/60"
              >
                <label htmlFor="question" className="sr-only">
                  Ask a BI question
                </label>
                <textarea
                  id="question"
                  rows={1}
                  className="block max-h-36 min-h-[52px] w-full resize-none bg-transparent py-3.5 pl-4 pr-14 text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
                  placeholder="Ask a business question…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!isLoading) void handleSubmit(e);
                    }
                  }}
                />
                {/* Send / Loading button — always vertically anchored to bottom-right */}
                <div className="pointer-events-none absolute bottom-0 right-0 flex h-[52px] w-14 items-center justify-center">
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
                    aria-label={isLoading ? "Generating…" : "Send"}
                  >
                    {isLoading ? (
                      /* Spinner */
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      /* Send arrow */
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
              <p className="mt-1.5 px-1 text-[11px] text-neutral-400">
                Shift + Enter for a new line &nbsp;·&nbsp; you can type your next question while waiting
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
