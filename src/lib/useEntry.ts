import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { Answers, SCHEMA_VERSION } from "./schema";

export type SaveStatus = "idle" | "loading" | "saving" | "saved" | "error";

const draftKey = (userId: string, date: string) => `growthlog-draft-${userId}-${date}`;

export function useEntry(userId: string, date: string) {
  const [answers, setAnswers] = useState<Answers>({});
  const [status, setStatus] = useState<SaveStatus>("loading");
  const timer = useRef<number | null>(null);
  const latest = useRef<Answers>({});

  // Laden
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const { data, error } = await supabase
        .from("daily_entries")
        .select("answers")
        .eq("user_id", userId)
        .eq("entry_date", date)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Fallback: lokaler Entwurf
        const draft = localStorage.getItem(draftKey(userId, date));
        setAnswers(draft ? JSON.parse(draft) : {});
        setStatus("error");
        return;
      }
      if (data && data.answers) {
        setAnswers(data.answers as Answers);
      } else {
        const draft = localStorage.getItem(draftKey(userId, date));
        setAnswers(draft ? JSON.parse(draft) : {});
      }
      setStatus("idle");
    })();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [userId, date]);

  const persist = useCallback(
    async (a: Answers) => {
      setStatus("saving");
      const { error } = await supabase.from("daily_entries").upsert(
        {
          user_id: userId,
          entry_date: date,
          answers: a,
          schema_version: SCHEMA_VERSION,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,entry_date" }
      );
      if (error) {
        setStatus("error");
      } else {
        localStorage.removeItem(draftKey(userId, date));
        setStatus("saved");
      }
    },
    [userId, date]
  );

  const update = useCallback(
    (id: string, value: unknown) => {
      setAnswers((prev) => {
        const next = { ...prev, [id]: value };
        latest.current = next;
        // Sofort lokal sichern (Absturz-/Offlineschutz)
        try {
          localStorage.setItem(draftKey(userId, date), JSON.stringify(next));
        } catch {
          /* Speicher voll – ignorieren */
        }
        return next;
      });
      setStatus("saving");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => persist(latest.current), 1200);
    },
    [persist, userId, date]
  );

  const retry = useCallback(() => persist(latest.current), [persist]);

  return { answers, update, status, retry };
}
