import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QuestionRenderer } from "../components/Fields";
import { FULL_SECTIONS, QUESTIONS, Question } from "../lib/schema";
import { useEntry } from "../lib/useEntry";

const toIso = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayIso = () => toIso(new Date());

const shiftDate = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return toIso(d);
};

const formatDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

// Ein einziges, geführtes Tagebuch. Der obere Überblick enthält NUR die
// grundlegenden Tageswerte und keine Inhalte, die weiter unten in einem
// ausführlichen Bereich (Mini-Tagebuch, Traumtagebuch, Entscheidungen,
// Wachstum, soziale Sicherheit) ausführlicher vorkommen.
// Alle Felder bleiben optional; keine Änderung an Daten-/Speicherlogik.
const OVERVIEW_IDS = ["mood_overall", "energy"];
const OVERVIEW_QUESTIONS: Question[] = OVERVIEW_IDS.map((id) => QUESTIONS[id]);

interface JournalSection {
  id: string;
  title: string;
  questions: Question[];
}
const SECTIONS: JournalSection[] = [
  { id: "overview", title: "Überblick", questions: OVERVIEW_QUESTIONS },
  ...FULL_SECTIONS.map((s) => ({ id: s.id, title: s.title, questions: s.questions })),
];

export default function Today({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
  });
  const { answers, update, status, retry } = useEntry(userId, date);

  const isToday = date === todayIso();

  const setDate = (iso: string) => {
    if (iso === todayIso()) setParams({});
    else setParams({ date: iso });
  };

  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const save = useMemo(() => {
    switch (status) {
      case "loading":
        return { cls: "", text: "Lädt…" };
      case "saving":
        return { cls: "saving", text: "Speichert…" };
      case "saved":
        return { cls: "saved", text: "Gespeichert" };
      case "error":
        return { cls: "err", text: "Nicht gespeichert" };
      default:
        return { cls: "", text: "Bereit" };
    }
  }, [status]);

  const renderQuestion = (q: Question) => (
    <Fragment key={q.id}>
      <QuestionRenderer q={q} value={answers[q.id]} onChange={(v) => update(q.id, v)} />
      {q.id === "dreamed" && answers.dreamed === "Ja" && (
        <QuestionRenderer
          q={QUESTIONS.dream_text}
          value={answers.dream_text}
          onChange={(v) => update("dream_text", v)}
        />
      )}
    </Fragment>
  );

  return (
    <div className="page">
      <div className="day-header">
        <button
          type="button"
          className="icon-btn"
          aria-label="Vorheriger Tag"
          onClick={() => setDate(shiftDate(date, -1))}
        >
          ‹
        </button>
        <div className="day-title">
          <h1>{isToday ? "Heute" : formatDate(date)}</h1>
          <span className="muted small">{date}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Nächster Tag"
          onClick={() => setDate(shiftDate(date, 1))}
          disabled={isToday}
        >
          ›
        </button>
      </div>

      <div className="row-between">
        <p className="section-hint" style={{ margin: 0 }}>
          Halte fest, was passt – jedes Feld ist freiwillig.
        </p>
        <span className={`save-chip ${save.cls}`}>
          <span className="save-dot" />
          {save.text}
          {status === "error" && (
            <button type="button" className="link-btn" onClick={retry}>
              Erneut
            </button>
          )}
        </span>
      </div>

      {status === "loading" ? (
        <div className="card">
          <div className="skeleton skel-line w40" />
          <div className="skeleton skel-line w80" />
          <div className="skeleton skel-line w60" />
        </div>
      ) : (
        SECTIONS.map((section) => {
          const open = !!openSections[section.id];
          if (!section.questions.length) return null;
          return (
            <div className="card" key={section.id}>
              <button
                type="button"
                className="section-toggle"
                aria-expanded={open}
                onClick={() => toggleSection(section.id)}
              >
                <span>{section.title}</span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
              {open && (
                <div className="accordion-body">
                  {section.questions.map(renderQuestion)}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
