import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QuestionRenderer } from "../components/Fields";
import { FULL_SECTIONS, QUESTIONS, QUICK_IDS } from "../lib/schema";
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

export default function Today({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const [mode, setMode] = useState<"quick" | "full">("quick");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const { answers, update, status, retry } = useEntry(userId, date);

  const isToday = date === todayIso();

  const setDate = (iso: string) => {
    if (iso === todayIso()) setParams({});
    else setParams({ date: iso });
  };

  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const statusText = useMemo(() => {
    switch (status) {
      case "loading":
        return "Lädt…";
      case "saving":
        return "Speichert…";
      case "saved":
        return "Gespeichert";
      case "error":
        return "Fehler beim Speichern";
      default:
        return "";
    }
  }, [status]);

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
        <div className="mode-switch">
          <button
            type="button"
            className={mode === "quick" ? "pill active" : "pill"}
            onClick={() => setMode("quick")}
          >
            Schnell
          </button>
          <button
            type="button"
            className={mode === "full" ? "pill active" : "pill"}
            onClick={() => setMode("full")}
          >
            Komplett
          </button>
        </div>
        <span className={status === "error" ? "status error" : "status"}>
          {statusText}
          {status === "error" && (
            <button type="button" className="link-btn" onClick={retry}>
              Erneut versuchen
            </button>
          )}
        </span>
      </div>

      {status === "loading" ? (
        <div className="card muted">Eintrag wird geladen…</div>
      ) : mode === "quick" ? (
        <div className="card">
          {QUICK_IDS.map((id) => (
            <QuestionRenderer
              key={id}
              q={QUESTIONS[id]}
              value={answers[id]}
              onChange={(v) => update(id, v)}
            />
          ))}
        </div>
      ) : (
        FULL_SECTIONS.map((section) => (
          <div className="card" key={section.id}>
            <button
              type="button"
              className="section-toggle"
              onClick={() => toggleSection(section.id)}
            >
              <span>{section.title}</span>
              <span className="muted">{openSections[section.id] ? "−" : "+"}</span>
            </button>
            {openSections[section.id] &&
              section.questions.map((q) => (
                <QuestionRenderer
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  onChange={(v) => update(q.id, v)}
                />
              ))}
          </div>
        ))
      )}
    </div>
  );
}
