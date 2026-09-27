import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  HeartHandshake,
  Loader2,
  Medal,
  Minus,
  Paperclip,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useAskAssistant } from "./hooks";
import type { PlayerStatLine } from "./types";

type StatMetric = "goals" | "assists" | "contributions";

interface StatCard {
  athleteId: string;
  playerName: string;
  primaryValue: number;
  primaryLabel: string;
  appearances: number;
}

interface Exchange {
  id: string;
  question: string;
  answer: string | null;
  status: "pending" | "ready" | "failed";
  askedAt: string;
  statCard: StatCard | null;
}

const MAX_EXCHANGES = 10;

interface QuickAction {
  id: string;
  label: string;
  icon: typeof Trophy;
  question?: string;
  metric?: StatMetric;
  action?: "compare";
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "top-scorer",
    label: "Top scorer",
    icon: Trophy,
    question: "Who has scored the most goals for us this season?",
    metric: "goals",
  },
  {
    id: "most-assists",
    label: "Most assists",
    icon: HeartHandshake,
    question: "Who has the most assists this season?",
    metric: "assists",
  },
  {
    id: "recent-form",
    label: "Recent form",
    icon: TrendingUp,
    question: "How has our recent form been?",
  },
  {
    id: "best-performer",
    label: "Best performer",
    icon: Medal,
    question: "Who has been our best all-round performer this season?",
    metric: "contributions",
  },
  {
    id: "compare-players",
    label: "Compare players",
    icon: Users,
    action: "compare",
  },
];

const METRIC_LABELS: Record<StatMetric, string> = {
  goals: "Goals",
  assists: "Assists",
  contributions: "Contributions",
};

function metricValue(player: PlayerStatLine, metric: StatMetric): number {
  if (metric === "goals") return player.goals;
  if (metric === "assists") return player.assists;
  return player.goals + player.assists;
}

/** Best player by a metric, or null when nobody has recorded it yet. */
function topPlayerByMetric(
  players: PlayerStatLine[],
  metric: StatMetric,
): StatCard | null {
  if (players.length === 0) return null;
  const sorted = [...players].sort(
    (a, b) => metricValue(b, metric) - metricValue(a, metric) || b.appearances - a.appearances,
  );
  const top = sorted[0];
  const value = metricValue(top, metric);
  if (value <= 0) return null;
  return {
    athleteId: top.athleteId,
    playerName: top.name,
    primaryValue: value,
    primaryLabel: METRIC_LABELS[metric],
    appearances: top.appearances,
  };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface AssistantChatPanelProps {
  seasonId?: string;
  seasonLabel: string;
  competitionLabel: string;
  players: PlayerStatLine[];
  onViewPlayer: (athleteId: string) => void;
  onComparePlayers: () => void;
}

/**
 * "Gaffer AI" — a floating natural-language stats assistant. Each question is
 * answered independently (no conversation history is sent to the model, and
 * nothing is persisted server-side); this panel just keeps its own
 * in-memory list of exchanges for display, cleared on reload.
 *
 * Quick-action stat cards are resolved from the `players` prop already
 * loaded on the page rather than parsed from the model's answer — reliable
 * numbers plus a "View player" link, independent of how the model phrases it.
 */
export function AssistantChatPanel({
  seasonId,
  seasonLabel,
  competitionLabel,
  players,
  onViewPlayer,
  onComparePlayers,
}: AssistantChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const ask = useAskAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [exchanges, isOpen]);

  const submitQuestion = (text: string, metric?: StatMetric) => {
    const trimmed = text.trim();
    if (!trimmed || ask.isPending) return;

    const id = crypto.randomUUID();
    const statCard = metric ? topPlayerByMetric(players, metric) : null;
    setExchanges((current) =>
      [
        ...current,
        {
          id,
          question: trimmed,
          answer: null,
          status: "pending" as const,
          askedAt: new Date().toISOString(),
          statCard,
        },
      ].slice(-MAX_EXCHANGES),
    );
    setQuestion("");

    ask.mutate(
      { question: trimmed, seasonId },
      {
        onSuccess: (result) => {
          setExchanges((current) =>
            current.map((exchange) =>
              exchange.id === id
                ? { ...exchange, answer: result.answer, status: result.status }
                : exchange,
            ),
          );
        },
        onError: () => {
          setExchanges((current) =>
            current.map((exchange) =>
              exchange.id === id ? { ...exchange, status: "failed" as const } : exchange,
            ),
          );
        },
      },
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitQuestion(question);
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.action === "compare") {
      onComparePlayers();
      return;
    }
    if (action.question) submitQuestion(action.question, action.metric);
  };

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[640px] max-h-[calc(100vh-8rem)] w-[420px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="size-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-foreground">Gaffer AI</h2>
                  <span className="rounded-full border border-primary/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                    Beta
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {seasonLabel} · {competitionLabel}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Start new conversation"
                title="Start new conversation"
                onClick={() => setExchanges([])}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Minimize"
                onClick={() => setIsOpen(false)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Minus className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setIsOpen(false)}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Hi! I&apos;m Gaffer AI</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask me anything about your team, matches, players or performance.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => handleQuickAction(action)}
                  disabled={ask.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <action.icon className="size-3.5 text-primary" />
                  {action.label}
                </button>
              ))}
            </div>

            {exchanges.map((exchange) => (
              <div key={exchange.id} className="space-y-2">
                {/* User bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">You</span>
                      <span>{formatTime(exchange.askedAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-foreground">{exchange.question}</p>
                  </div>
                </div>

                {/* Assistant bubble */}
                <div className="flex items-start gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Sparkles className="size-3" />
                  </div>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-background px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Gaffer AI</span>
                      <span>{formatTime(exchange.askedAt)}</span>
                    </div>

                    {exchange.status === "pending" ? (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        Thinking…
                      </p>
                    ) : exchange.status === "failed" || !exchange.answer ? (
                      <p className="mt-1 text-sm text-destructive">
                        Could not answer that. Try again.
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-sm text-foreground">{exchange.answer}</p>

                        {exchange.statCard && (
                          <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                            <div className="flex items-center gap-3">
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                                <BarChart3 className="size-4" />
                              </div>
                              <div className="flex flex-1 items-center gap-4">
                                <div>
                                  <p className="text-base font-bold text-foreground">
                                    {exchange.statCard.primaryValue}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {exchange.statCard.primaryLabel}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-base font-bold text-foreground">
                                    {exchange.statCard.appearances}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground">Appearances</p>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onViewPlayer(exchange.statCard!.athleteId)}
                              className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                            >
                              View player
                              <ArrowRight className="size-3" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-3">
            <button
              type="button"
              disabled
              title="Attachments coming soon"
              aria-label="Attachments coming soon"
              className="flex size-9 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground opacity-50"
            >
              <Paperclip className="size-4" />
            </button>
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about your team…"
              maxLength={300}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={ask.isPending || question.trim().length < 3}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {ask.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </form>
        </div>
      )}

      {/* Floating launcher */}
      <button
        type="button"
        aria-label={isOpen ? "Close Gaffer AI" : "Open Gaffer AI"}
        onClick={() => setIsOpen((current) => !current)}
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Sparkles className="size-6" />
      </button>
    </>
  );
}
