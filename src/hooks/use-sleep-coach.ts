import { useEffect, useRef, useState } from "react";
import type { CoachConversation } from "../../shared/coach";
import { api } from "../lib/api";
import { streamCoachReply } from "../lib/coach-api";

export function useSleepCoach(childId: string) {
  const [conversation, setConversation] = useState<CoachConversation>({
    enabled: false,
    turns: [],
  });
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<{
    id: string;
    question: string;
    answer: string;
  } | null>(null);
  const failed = useRef<{ id: string; question: string } | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const request = useRef<AbortController | null>(null);
  const path = `/children/${childId}/coach`;

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const saved = await api<CoachConversation>(path, {
        signal: controller.signal,
      });
      if (mounted.current && !controller.signal.aborted) setConversation(saved);
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        setError((error as Error).message);
    } finally {
      if (mounted.current && !controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, [childId]);

  async function ask(questionInput: string): Promise<boolean> {
    const question = questionInput.trim();
    if (!question || !conversation.enabled || inFlight.current) return false;
    inFlight.current = true;
    const next =
      failed.current?.question === question
        ? failed.current
        : { id: crypto.randomUUID(), question };
    const controller = new AbortController();
    request.current = controller;
    setPending({ ...next, answer: "" });
    setAsking(true);
    setError("");
    try {
      const turn = await streamCoachReply(
        childId,
        next,
        controller.signal,
        (text) => {
          if (!mounted.current || controller.signal.aborted) return;
          setPending((current) =>
            current?.id === next.id
              ? { ...current, answer: current.answer + text }
              : current,
          );
        },
      );
      if (!mounted.current || controller.signal.aborted) return false;
      setConversation((saved) => ({
        ...saved,
        turns: [
          ...saved.turns.filter((previous) => previous.id !== turn.id),
          turn,
        ],
      }));
      failed.current = null;
      setPending(null);
      return true;
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) {
        failed.current = next;
        setPending((current) => (current?.answer ? current : null));
        setError((error as Error).message);
      }
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current && !controller.signal.aborted) setAsking(false);
    }
  }

  return { ...conversation, loading, asking, error, pending, ask, load };
}
