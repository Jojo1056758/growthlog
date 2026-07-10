// Zentrale, erweiterbare Definition aller Fragen.
// Neue Fragen: einfach hier ergänzen. Alte Einträge bleiben gültig,
// fehlende Antworten gelten als "unbeantwortet".
export const SCHEMA_VERSION = 1;

export type FieldType =
  | "scale10"
  | "text"
  | "textarea"
  | "ynu" // Ja / Nein / Unsicher
  | "yn" // Ja / Nein
  | "list" // wiederholbare Textliste mit Plus-Button
  | "slist"; // wiederholbare strukturierte Liste

export interface SubField {
  id: string;
  label: string;
  type: "text" | "textarea" | "scale10";
}

export interface Question {
  id: string;
  label: string;
  type: FieldType;
  help?: string;
  fields?: SubField[]; // nur für slist
  addLabel?: string; // nur für list/slist: Beschriftung des Hinzufügen-Buttons
}

export interface Section {
  id: string;
  title: string;
  questions: Question[];
}

const Q = (q: Question) => q;

export const QUESTIONS: Record<string, Question> = {
  mood_overall: Q({ id: "mood_overall", label: "Gesamtstimmung heute", type: "scale10" }),
  energy: Q({ id: "energy", label: "Energie", type: "scale10" }),
  day_summary: Q({ id: "day_summary", label: "Kurze Tageszusammenfassung", type: "textarea" }),
  improved_today: Q({ id: "improved_today", label: "Bin ich heute besser geworden?", type: "ynu" }),
  learned_today: Q({ id: "learned_today", label: "Was habe ich gelernt?", type: "list" }),
  good_decision: Q({ id: "good_decision", label: "Eine gute Entscheidung heute", type: "text" }),
  social_courage: Q({ id: "social_courage", label: "Gab es eine soziale Mut-Situation?", type: "textarea" }),
  proud_of: Q({ id: "proud_of", label: "Worauf bin ich stolz?", type: "list" }),
  tomorrow: Q({ id: "tomorrow", label: "Was möchte ich morgen tun?", type: "list" }),
  dreamed: Q({ id: "dreamed", label: "Hast du geträumt?", type: "yn" }),
  dream_text: Q({ id: "dream_text", label: "Woran hast du geträumt?", type: "textarea" }),

  did_today: Q({ id: "did_today", label: "Was habe ich heute gemacht?", type: "textarea" }),
  important_today: Q({ id: "important_today", label: "Was war heute wichtig?", type: "textarea" }),
  on_my_mind: Q({ id: "on_my_mind", label: "Was hat mich beschäftigt?", type: "textarea" }),
  remember: Q({ id: "remember", label: "Was möchte ich nicht vergessen?", type: "list" }),
  free_thoughts: Q({ id: "free_thoughts", label: "Freie Gedanken", type: "textarea" }),

  mood_morning: Q({ id: "mood_morning", label: "Stimmung morgens", type: "scale10" }),
  mood_noon: Q({ id: "mood_noon", label: "Stimmung mittags", type: "scale10" }),
  mood_evening: Q({ id: "mood_evening", label: "Stimmung abends", type: "scale10" }),
  motivation: Q({ id: "motivation", label: "Motivation", type: "scale10" }),
  motivation_morning: Q({ id: "motivation_morning", label: "Motivation morgens", type: "scale10" }),
  motivation_noon: Q({ id: "motivation_noon", label: "Motivation mittags", type: "scale10" }),
  motivation_evening: Q({ id: "motivation_evening", label: "Motivation abends", type: "scale10" }),

  stress: Q({ id: "stress", label: "Stress", type: "scale10" }),
  stress_morning: Q({ id: "stress_morning", label: "Stress morgens", type: "scale10" }),
  stress_noon: Q({ id: "stress_noon", label: "Stress mittags", type: "scale10" }),
  stress_evening: Q({ id: "stress_evening", label: "Stress abends", type: "scale10" }),

  focus: Q({ id: "focus", label: "Fokus", type: "scale10" }),
  focus_morning: Q({ id: "focus_morning", label: "Fokus morgens", type: "scale10" }),
  focus_noon: Q({ id: "focus_noon", label: "Fokus mittags", type: "scale10" }),
  focus_evening: Q({ id: "focus_evening", label: "Fokus abends", type: "scale10" }),

  calm: Q({ id: "calm", label: "Innere Ruhe", type: "scale10" }),
  calm_morning: Q({ id: "calm_morning", label: "Innere Ruhe morgens", type: "scale10" }),
  calm_noon: Q({ id: "calm_noon", label: "Innere Ruhe mittags", type: "scale10" }),
  calm_evening: Q({ id: "calm_evening", label: "Innere Ruhe abends", type: "scale10" }),

  energy_morning: Q({ id: "energy_morning", label: "Energie morgens", type: "scale10" }),
  energy_noon: Q({ id: "energy_noon", label: "Energie mittags", type: "scale10" }),
  energy_evening: Q({ id: "energy_evening", label: "Energie abends", type: "scale10" }),

  weight_morning: Q({ id: "weight_morning", label: "Gewicht morgens (kg)", type: "text" }),
  weight_morning_ate: Q({ id: "weight_morning_ate", label: "Vor dem Wiegen gegessen?", type: "yn" }),
  weight_evening: Q({ id: "weight_evening", label: "Gewicht abends (kg)", type: "text" }),
  weight_evening_ate: Q({ id: "weight_evening_ate", label: "Vor dem Wiegen gegessen?", type: "yn" }),

  mood_up: Q({ id: "mood_up", label: "Was hat meine Stimmung verbessert?", type: "list" }),
  mood_down: Q({ id: "mood_down", label: "Was hat meine Stimmung verschlechtert?", type: "list" }),

  feelings: Q({
    id: "feelings",
    label: "Besondere Gefühle",
    type: "slist",
    fields: [
      { id: "feeling", label: "Gefühl", type: "text" },
      { id: "intensity", label: "Intensität", type: "scale10" },
      { id: "situation", label: "Situation / Auslöser", type: "textarea" },
      { id: "insight", label: "Gedanke / Erkenntnis dazu", type: "textarea" },
    ],
  }),

  dreams: Q({
    id: "dreams",
    label: "Träume",
    type: "slist",
    addLabel: "Traum hinzufügen",
    fields: [
      { id: "title", label: "Titel", type: "text" },
      { id: "description", label: "Beschreibung", type: "textarea" },
      { id: "intensity", label: "Intensität", type: "scale10" },
      { id: "interpretation", label: "Eigene Interpretation", type: "textarea" },
    ],
  }),

  growth_items: Q({
    id: "growth_items",
    label: "Wachstumsbeiträge",
    type: "slist",
    fields: [
      { id: "title", label: "Was ist besser geworden?", type: "text" },
      { id: "category", label: "Kategorie (z. B. Disziplin, Mut, Schule)", type: "text" },
      { id: "progress", label: "Größe des Fortschritts", type: "scale10" },
      { id: "evidence", label: "Konkreter Beleg", type: "textarea" },
    ],
  }),

  social_situations: Q({
    id: "social_situations",
    label: "Soziale Situationen",
    type: "slist",
    fields: [
      { id: "title", label: "Situation", type: "text" },
      { id: "fear_expected", label: "Erwartete Angst vorher", type: "scale10" },
      { id: "fear_actual", label: "Tatsächliche Angst", type: "scale10" },
      { id: "outcome", label: "Was ist tatsächlich passiert?", type: "textarea" },
      { id: "learned", label: "Was habe ich gelernt?", type: "textarea" },
    ],
  }),
  initiated_conversations: Q({
    id: "initiated_conversations",
    label: "Selbst begonnene Gespräche (Anzahl)",
    type: "text",
  }),

  decisions: Q({
    id: "decisions",
    label: "Entscheidungen",
    type: "slist",
    fields: [
      { id: "title", label: "Entscheidung", type: "text" },
      { id: "rating", label: "Gut / schlecht / unklar", type: "text" },
      { id: "reason", label: "Warum so entschieden?", type: "textarea" },
      { id: "rule", label: "Daraus gelernte Regel", type: "textarea" },
    ],
  }),

  sleep_hours: Q({ id: "sleep_hours", label: "Schlafdauer (Stunden)", type: "text" }),
  sleep_quality: Q({ id: "sleep_quality", label: "Schlafqualität", type: "scale10" }),
  training: Q({ id: "training", label: "Training (Art, Dauer)", type: "text" }),
  complaints: Q({ id: "complaints", label: "Beschwerden", type: "list" }),

  gym_visited: Q({ id: "gym_visited", label: "Warst du heute im Gym?", type: "yn" }),
  gym_duration: Q({ id: "gym_duration", label: "Trainingsdauer (Minuten)", type: "text" }),
  gym_exercises: Q({ id: "gym_exercises", label: "Anzahl Übungen", type: "text" }),

  grateful: Q({ id: "grateful", label: "Wofür bin ich dankbar?", type: "list" }),
  best_moments: Q({ id: "best_moments", label: "Beste Momente", type: "list" }),

  difficult: Q({ id: "difficult", label: "Was war schwierig?", type: "list" }),
  mistakes_learned: Q({ id: "mistakes_learned", label: "Fehler und was ich daraus lerne", type: "list" }),

  avoid_tomorrow: Q({ id: "avoid_tomorrow", label: "Was möchte ich morgen vermeiden?", type: "text" }),
  self_reminder: Q({ id: "self_reminder", label: "Erinnerung an mich selbst", type: "text" }),
};

// Schnellmodus: 60–120 Sekunden
export const QUICK_IDS: string[] = [
  "mood_overall",
  "energy",
  "day_summary",
  "improved_today",
  "learned_today",
  "good_decision",
  "social_courage",
  "proud_of",
  "tomorrow",
  "dreamed",
];

// Vollständiger Check-in (teilt sich Daten mit dem Schnellmodus)
export const FULL_SECTIONS: Section[] = [
  {
    id: "journal",
    title: "Mini-Tagebuch",
    questions: [
      QUESTIONS.did_today,
      QUESTIONS.important_today,
      QUESTIONS.on_my_mind,
      QUESTIONS.remember,
      QUESTIONS.free_thoughts,
    ],
  },
  { id: "feelings", title: "Besondere Gefühle", questions: [QUESTIONS.feelings] },
  {
    id: "dreams",
    title: "Traumtagebuch",
    questions: [QUESTIONS.sleep_quality, QUESTIONS.sleep_hours, QUESTIONS.dreamed, QUESTIONS.dreams],
  },
  {
    id: "social",
    title: "Soziale Sicherheit & Mut",
    questions: [QUESTIONS.social_situations, QUESTIONS.initiated_conversations],
  },
  { id: "decisions", title: "Entscheidungen", questions: [QUESTIONS.decisions] },
  {
    id: "health",
    title: "Körper & Gesundheit",
    questions: [QUESTIONS.complaints],
  },
  {
    id: "gym",
    title: "Gym",
    questions: [QUESTIONS.gym_visited, QUESTIONS.gym_duration, QUESTIONS.gym_exercises],
  },
  {
    id: "gratitude",
    title: "Stolz, Dankbarkeit & Höhepunkte",
    questions: [QUESTIONS.proud_of, QUESTIONS.grateful, QUESTIONS.best_moments],
  },
  {
    id: "difficulties",
    title: "Schwierigkeiten & Fehler",
    questions: [QUESTIONS.difficult, QUESTIONS.mistakes_learned],
  },
];

export type ListItem = { id: string; text: string };
export type SListItem = { id: string; [key: string]: unknown };
export type Answers = Record<string, unknown>;
