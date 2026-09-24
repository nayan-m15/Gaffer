import { useState, type FormEvent } from "react";
import { HelpCircle, Loader2, Send, Sparkles } from "lucide-react";
import { useAskAssistant } from "./hooks";

interface Exchange {
  id: string;
  question: string;
  answer: string | null;
  status: "pending" | "ready" | "failed";
}

const MAX_EXCHANGES = 10;

/**
 * "Ask about your team" — a natural-language stats Q&A box. Each question is
 * answered independently (no conversation history is sent to the model, and
 * nothing is persisted server-side); this panel just keeps its own
 * in-memory list of exchanges for display, cleared on reload.
 */
export function AssistantChatPanel({ seasonId }: { seasonId?: string }) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const ask = useAskAssistant();

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;

    const id = crypto.randomUUID();
    setExchanges((current) =>
      [
        { id, question: trimmed, answer: null, status: "pending" as const },
        ...current,
      ].slice(0, MAX_EXCHANGES),
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
              exchange.id === id
                ? { ...exchange, status: "failed" as const }
                : exchange,
            ),
          );
        },
      },
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <HelpCircle className="size-4 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ask About Your Team
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Who has the most assists?"
          maxLength={300}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={ask.isPending || question.trim().length < 3}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {ask.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </button>
      </form>

      {exchanges.length > 0 && (
        <ul className="mt-4 space-y-3">
          {exchanges.map((exchange) => (
            <li
              key={exchange.id}
              className="border-t border-border pt-3 first:border-t-0 first:pt-0"
            >
              <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
                <span className="text-muted-foreground">Q:</span>
                {exchange.question}
              </p>
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
                <p className="mt-1 flex items-start gap-1.5 text-sm text-foreground">
                  <Sparkles
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {exchange.answer}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
