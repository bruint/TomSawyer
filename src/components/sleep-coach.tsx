import { ArrowUp, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Child } from "../../shared/types";
import { useSleepCoach } from "../hooks/use-sleep-coach";
import { age } from "../lib/format";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const prompts = [
  {
    label: "What now?",
    question: "What should we do from here, based on how today is going?",
  },
  {
    label: "Short nap",
    question: "How should we adjust the rest of today if a nap is short?",
  },
  {
    label: "Late wake",
    question: "How can we adjust naps and bedtime after a late morning wake?",
  },
];

export function SleepCoach({
  child,
  online,
  onClose,
}: {
  child: Child;
  online: boolean;
  onClose: () => void;
}) {
  const coach = useSleepCoach(child.id);
  const [draft, setDraft] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.current)
      messages.current.scrollTop = messages.current.scrollHeight;
  }, [coach.turns, coach.pending, coach.asking]);

  async function send(question: string) {
    const sent = await coach.ask(question);
    if (sent) setDraft("");
    else setDraft(question);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }
  const disabled = !online || coach.loading || coach.asking || !coach.enabled;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="coach-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle ref={heading} tabIndex={-1}>
            Sleep coach
          </DialogTitle>
          <DialogDescription>
            {child.name} · {age(child)}
          </DialogDescription>
        </DialogHeader>
        <div
          className="coach-messages"
          ref={messages}
          role="log"
          aria-label="Sleep coach conversation"
          aria-live="polite"
          aria-busy={coach.asking}
        >
          {coach.loading && (
            <div className="coach-status">
              <Loader2 className="spin" size={20} />
              Loading conversation…
            </div>
          )}
          {!coach.loading &&
            !coach.turns.length &&
            !coach.pending &&
            !coach.error && (
              <div className="coach-start">
                <MessageCircle size={26} />
                <h3>
                  {coach.enabled
                    ? "What’s happening?"
                    : "Coach is not connected"}
                </h3>
                {coach.enabled && (
                  <div className="coach-prompts">
                    {prompts.map((prompt) => (
                      <button
                        type="button"
                        key={prompt.label}
                        disabled={disabled}
                        onClick={() => void send(prompt.question)}
                      >
                        {prompt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          {coach.turns.map((turn) => (
            <div className="coach-turn" key={turn.id}>
              <div className="coach-question">{turn.question}</div>
              <div className="coach-answer">{turn.answer}</div>
              <time className="coach-time" dateTime={turn.contextAt}>
                {DateTime.fromISO(turn.contextAt)
                  .setZone(child.timezone)
                  .toFormat("ccc, d LLL · h:mm a")
                  .toLowerCase()}
              </time>
            </div>
          ))}
          {coach.pending && (
            <div className="coach-turn">
              <div className="coach-question">{coach.pending.question}</div>
              <div className="coach-status">
                <Loader2 size={18} className="spin" />
                Thinking…
              </div>
            </div>
          )}
        </div>
        <div className="coach-compose">
          {coach.error && (
            <div className="coach-error" role="alert">
              <span>{coach.error}</span>
              {!coach.enabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Retry connection"
                  onClick={() => void coach.load()}
                >
                  <RefreshCw size={18} />
                </Button>
              )}
            </div>
          )}
          {!online && (
            <p className="coach-error">Reconnect to ask the coach.</p>
          )}
          <form onSubmit={submit}>
            <textarea
              aria-label="Question for sleep coach"
              placeholder="Ask about sleep…"
              maxLength={3000}
              rows={2}
              value={draft}
              disabled={disabled}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send question"
              disabled={disabled || !draft.trim()}
            >
              {coach.asking ? <Loader2 className="spin" /> : <ArrowUp />}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
