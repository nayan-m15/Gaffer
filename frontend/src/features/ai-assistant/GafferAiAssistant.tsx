import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Check,
  Loader2,
  Minus,
  RotateCcw,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import {
  useCancelAssistantAction,
  useConfirmAssistantAction,
  useSendAssistantMessage,
} from "./hooks";
import type {
  AssistantAppliedLineup,
  AssistantContext,
  AssistantCreatedEntity,
  AssistantFormationOption,
  AssistantPlayerOption,
  AssistantProposedAction,
} from "./types";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
  playerOptions?: AssistantPlayerOption[];
  formationOptions?: AssistantFormationOption[];
}

interface ContextConfig {
  subtitle: string;
  placeholder: string;
  suggestions: string[];
  welcome: string;
}

const CONTEXT_CONFIG: Record<AssistantContext, ContextConfig> = {
  roster: {
    subtitle: "Roster Assistant",
    placeholder: "Ask me to add a player…",
    welcome: "I can add a new player to your roster through a quick chat — no form required.",
    suggestions: ["Add a new player", "Help me complete a player profile"],
  },
  injuries: {
    subtitle: "Injury Assistant",
    placeholder: "Ask about an injury or recovery…",
    welcome: "I can record a new injury, or answer questions about a player's recorded injuries and recovery status.",
    suggestions: ["Record a new injury", "Ask about a player's injury"],
  },
  competitions: {
    subtitle: "Competition Assistant",
    placeholder: "Ask me to create a league…",
    welcome: "I can create a new league or competition for your team through a quick chat.",
    suggestions: ["Create a league", "Create a competition / tournament"],
  },
  lineup: {
    subtitle: "Team Assistant",
    placeholder: "Ask me to suggest a lineup…",
    welcome: "I can help you build a lineup using your squad's positions, availability and performance data.",
    suggestions: [
      "Suggest my best lineup",
      "Choose a formation",
      "Compare two players",
      "Improve my current lineup",
    ],
  },
};

/** Shown instead of `CONTEXT_CONFIG.competitions` when `competitionId` is set — the assistant is on an existing competition's own page, where creating a new league/competition doesn't make sense. */
const ADD_TEAM_CONFIG: ContextConfig = {
  subtitle: "Team Assistant",
  placeholder: "Ask me to add a team…",
  welcome: "I can add a participating team to this competition.",
  suggestions: ["Add a team"],
};

function createId(): string {
  return crypto.randomUUID();
}

interface GafferAiAssistantProps {
  context: AssistantContext;
  /** A player already selected on the page — the assistant will not ask the coach to choose one again. */
  selectedPlayerId?: string;
  /** An existing competition's id — switches the "competitions" context into "add a team to this competition" mode instead of "create a league/competition". */
  competitionId?: string;
  /** Called after a create action is confirmed, so the host page can refresh/navigate. */
  onEntityCreated?: (entity: AssistantCreatedEntity) => void;
  /** Called after a lineup suggestion is confirmed — the host page loads it onto its own editable board; nothing is persisted by the assistant itself. */
  onLineupApplied?: (lineup: AssistantAppliedLineup) => void;
}

/**
 * Shared floating "Gaffer AI" assistant. One reusable component configured
 * per page via `context` (see `GAFFER_AI_ASSISTANT_IMPLEMENTATION_PLAN.md`) —
 * do not build a separate chatbot per page.
 */
export function GafferAiAssistant({
  context,
  selectedPlayerId,
  competitionId,
  onEntityCreated,
  onLineupApplied,
}: GafferAiAssistantProps) {
  const config = competitionId ? ADD_TEAM_CONFIG : CONTEXT_CONFIG[context];

  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState(createId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeProposal, setActiveProposal] = useState<AssistantProposedAction | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useSendAssistantMessage();
  const confirmAction = useConfirmAssistantAction();
  const cancelAction = useCancelAssistantAction();
  const isPending = sendMessage.isPending || confirmAction.isPending || cancelAction.isPending;

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeProposal, isOpen]);

  const pushMessage = (message: ChatMessage) => setMessages((current) => [...current, message]);

  const handleSend = (rawText: string) => {
    const text = rawText.trim();
    if (!text || isPending) return;

    pushMessage({ id: createId(), role: "user", text });
    setInput("");
    setActiveProposal(null);

    sendMessage.mutate(
      { conversationId, context, message: text, selectedPlayerId, competitionId },
      {
        onSuccess: (result) => {
          pushMessage({
            id: createId(),
            role: "assistant",
            text: result.message,
            playerOptions: result.playerOptions,
            formationOptions: result.formationOptions,
          });
          if (result.requiresConfirmation && result.proposedAction) {
            setActiveProposal(result.proposedAction);
          }
        },
        onError: () => {
          pushMessage({
            id: createId(),
            role: "assistant",
            text: "Something went wrong reaching the assistant. Please try again.",
            isError: true,
          });
        },
      },
    );
  };

  const handleConfirm = () => {
    if (isPending) return;
    confirmAction.mutate(
      { conversationId, context },
      {
        onSuccess: (result) => {
          pushMessage({ id: createId(), role: "assistant", text: result.message });
          setActiveProposal(null);
          if (result.createdEntity) onEntityCreated?.(result.createdEntity);
          if (result.appliedLineup) onLineupApplied?.(result.appliedLineup);
        },
        onError: () => {
          pushMessage({
            id: createId(),
            role: "assistant",
            text: "I couldn't save that because the server returned an error. Your details have been kept so you can try again.",
            isError: true,
          });
        },
      },
    );
  };

  const handleCancelProposal = () => {
    if (isPending) return;
    cancelAction.mutate(
      { conversationId, context },
      {
        onSuccess: (result) => {
          pushMessage({ id: createId(), role: "assistant", text: result.message });
          setActiveProposal(null);
        },
      },
    );
  };

  const handleEditProposal = () => {
    setActiveProposal(null);
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    setConversationId(createId());
    setMessages([]);
    setActiveProposal(null);
    setInput("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend(input);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-x-4 bottom-4 z-50 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[640px] sm:max-h-[calc(100vh-8rem)] sm:w-[420px] sm:max-w-[calc(100vw-2rem)]">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="size-4.5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Gaffer AI</h2>
                <p className="text-xs text-muted-foreground">{config.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Start new chat"
                title="Start new chat"
                onClick={handleNewChat}
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
            {messages.length === 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground">Hi! I&apos;m Gaffer AI</p>
                <p className="mt-1 text-sm text-muted-foreground">{config.welcome}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {config.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleSend(suggestion)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-2">
                {entry.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2">
                      <p className="text-sm text-foreground">{entry.text}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Sparkles className="size-3" />
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl rounded-tl-sm border px-3 py-2 ${
                        entry.isError
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <p
                        className={`whitespace-pre-line text-sm ${entry.isError ? "text-destructive" : "text-foreground"}`}
                      >
                        {entry.text}
                      </p>

                      {entry.playerOptions && entry.playerOptions.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {entry.playerOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleSend(option.name)}
                              disabled={isPending}
                              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <User className="size-3.5 text-primary" />
                              <span className="font-medium text-foreground">{option.name}</span>
                              {option.squadNumber != null && (
                                <span className="text-muted-foreground">#{option.squadNumber}</span>
                              )}
                              {option.position && (
                                <span className="text-muted-foreground">{option.position}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}

                      {entry.formationOptions && entry.formationOptions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {entry.formationOptions.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => handleSend(option.label)}
                              disabled={isPending}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isPending && (
              <div className="flex items-center gap-1.5 pl-8 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Thinking…
              </div>
            )}

            {activeProposal && (
              <div className="ml-8 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <div className="space-y-1">
                  {activeProposal.displaySummary.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="text-right font-medium text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={handleEditProposal}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelProposal}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSend(input);
            }}
            className="flex items-end gap-2 border-t border-border p-3"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={config.placeholder}
              rows={1}
              maxLength={1000}
              className="max-h-28 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              aria-label="Send"
              disabled={isPending || input.trim().length === 0}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      )}

      {/* Floating launcher */}
      <button
        type="button"
        aria-label={isOpen ? "Close Gaffer AI" : "Ask Gaffer AI"}
        title="Ask Gaffer AI"
        onClick={() => setIsOpen((current) => !current)}
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Sparkles className="size-6" />
      </button>
    </>
  );
}
