// Zentrale Quiz-Logik: Modi, Filterung/Sortierung und Statistik-Helfer.
// Reine Funktionen (bis auf recordAnswer), damit Setup- und Session-Screen
// dieselbe, nachvollziehbare Auswahl treffen.
import { supabase } from "./supabase";

export type Rating = "correct" | "partial" | "wrong" | "unknown";

export interface WordRow {
  id: string;
  word: string;
  definition: string;
  definition2: string | null;
  example: string | null;
  example2: string | null;
  category: string | null;
  notes: string | null;
  review_count: number;
  correct_count: number;
  partial_count: number;
  wrong_count: number;
  unknown_count: number;
  last_reviewed_at: string | null;
  last_correct_at: string | null;
  created_at: string;
}

export const WORD_SELECT_COLUMNS =
  "id, word, definition, definition2, example, example2, category, notes, " +
  "review_count, correct_count, partial_count, wrong_count, unknown_count, " +
  "last_reviewed_at, last_correct_at, created_at";

export type QuizModeId =
  | "all"
  | "random"
  | "last7days"
  | "never_reviewed"
  | "never_correct"
  | "frequently_wrong"
  | "frequently_correct"
  | "due";

export interface QuizModeInfo {
  id: QuizModeId;
  label: string;
  description: string;
  forcesRandomOrder?: boolean;
}

export const QUIZ_MODES: QuizModeInfo[] = [
  { id: "all", label: "Alle Wörter", description: "Alle gespeicherten Wörter werden abgefragt." },
  {
    id: "random",
    label: "Zufällige Wörter",
    description: "Alle Wörter in zufälliger Reihenfolge.",
    forcesRandomOrder: true,
  },
  {
    id: "last7days",
    label: "Letzte 7 Tage",
    description: "Nur Wörter, die in den letzten sieben Kalendertagen hinzugefügt wurden.",
  },
  {
    id: "never_reviewed",
    label: "Noch nie abgefragt",
    description: "Wörter, die bisher in keinem Quiz vorkamen.",
  },
  {
    id: "never_correct",
    label: "Noch nie richtig",
    description: "Bereits abgefragt, aber noch nie richtig beantwortet.",
  },
  {
    id: "frequently_wrong",
    label: "Häufig falsch",
    description: "Wörter mit besonders hoher Fehlerquote zuerst.",
  },
  {
    id: "frequently_correct",
    label: "Häufig richtig",
    description: "Wörter, die überwiegend richtig beantwortet wurden.",
  },
  {
    id: "due",
    label: "Fällige Wiederholungen",
    description: "Priorisiert problematische oder länger nicht abgefragte Wörter.",
  },
];

export function successRate(w: WordRow): number | null {
  return w.review_count > 0 ? w.correct_count / w.review_count : null;
}

export function neverReviewed(w: WordRow): boolean {
  return w.review_count === 0;
}

export function neverCorrect(w: WordRow): boolean {
  return w.review_count > 0 && w.correct_count === 0;
}

function daysSince(iso: string | null): number {
  if (!iso) return 90;
  return Math.min((Date.now() - new Date(iso).getTime()) / 86400000, 90);
}

function errorRate(w: WordRow): number {
  return w.review_count > 0 ? (w.wrong_count + w.unknown_count) / w.review_count : -1;
}

function correctRate(w: WordRow): number {
  return w.review_count > 0 ? w.correct_count / w.review_count : -1;
}

// Einfache, nachvollziehbare Priorisierung: nie abgefragte Wörter zuerst,
// danach niedrige Erfolgsquote und lange zurückliegende letzte Abfrage.
function dueScore(w: WordRow): number {
  if (w.review_count === 0) return 1000;
  const rate = w.correct_count / w.review_count;
  return (1 - rate) * 100 + daysSince(w.last_reviewed_at);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface QuizSettings {
  mode: QuizModeId;
  category: string | null; // null = alle Kategorien
  count: number | "all";
  order: "random" | "fixed";
}

export function filterByMode(all: WordRow[], mode: QuizModeId, category: string | null): WordRow[] {
  let pool = category ? all.filter((w) => w.category === category) : all.slice();

  switch (mode) {
    case "last7days": {
      const cutoff = Date.now() - 7 * 86400000;
      pool = pool.filter((w) => new Date(w.created_at).getTime() >= cutoff);
      break;
    }
    case "never_reviewed":
      pool = pool.filter(neverReviewed);
      break;
    case "never_correct":
      pool = pool.filter(neverCorrect);
      break;
    case "frequently_wrong":
      pool = pool.filter((w) => w.review_count > 0).sort((a, b) => errorRate(b) - errorRate(a));
      break;
    case "frequently_correct":
      pool = pool.filter((w) => w.review_count > 0).sort((a, b) => correctRate(b) - correctRate(a));
      break;
    case "due":
      pool = pool.sort((a, b) => dueScore(b) - dueScore(a));
      break;
    case "random":
      pool = shuffle(pool);
      break;
    case "all":
    default:
      break;
  }
  return pool;
}

export function buildQuizWords(all: WordRow[], settings: QuizSettings): WordRow[] {
  let pool = filterByMode(all, settings.mode, settings.category);

  if (settings.mode !== "random" && settings.order === "random") {
    pool = shuffle(pool);
  }

  const n = settings.count === "all" ? pool.length : Math.min(settings.count, pool.length);
  return pool.slice(0, n);
}

export async function recordAnswer(word: WordRow, rating: Rating): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    review_count: word.review_count + 1,
    last_reviewed_at: now,
  };
  if (rating === "correct") {
    patch.correct_count = word.correct_count + 1;
    patch.last_correct_at = now;
  } else if (rating === "partial") {
    patch.partial_count = word.partial_count + 1;
  } else if (rating === "wrong") {
    patch.wrong_count = word.wrong_count + 1;
  } else {
    patch.unknown_count = word.unknown_count + 1;
  }
  const { error } = await supabase.from("user_words").update(patch).eq("id", word.id);
  return { error: error ? error.message : null };
}

export const RATING_LABELS: Record<Rating, string> = {
  correct: "Richtig",
  partial: "Teilweise richtig",
  wrong: "Falsch",
  unknown: "Wusste ich nicht",
};

export const COUNT_OPTIONS: Array<number | "all"> = [5, 10, 20, "all"];
