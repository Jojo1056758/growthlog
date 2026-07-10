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

// Zentrale Kennzahlen im Überblick mit optionalen Tageszeitwerten
const CORE_METRICS = [
  { id: "mood_overall", label: "Gesamtstimmung" },
  { id: "energy", label: "Energie" },
  { id: "motivation", label: "Motivation" },
  { id: "stress", label: "Stress" },
  { id: "focus", label: "Fokus" },
  { id: "calm", label: "Innere Ruhe" },
];

const TIMEOFDAY_MAPPING: Record<string, { morning: string; noon: string; evening: string }> = {
  mood_overall: { morning: "mood_morning", noon: "mood_noon", evening: "mood_evening" },
  energy: { morning: "energy_morning", noon: "energy_noon", evening: "energy_evening" },
  motivation: { morning: "motivation_morning", noon: "motivation_noon", evening: "motivation_evening" },
  stress: { morning: "stress_morning", noon: "stress_noon", evening: "stress_evening" },
  focus: { morning: "focus_morning", noon: "focus_noon", evening: "focus_evening" },
  calm: { morning: "calm_morning", noon: "calm_noon", evening: "calm_evening" },
};

export default function Today({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const { answers, update, status, retry } = useEntry(userId, date);

  const isToday = date === todayIso();

  const setDate = (iso: string) => {
    if (iso === todayIso()) setParams({});
    else setParams({ date: iso });
  };

  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleMetric = (id: string) =>
    setExpandedMetric(expandedMetric === id ? null : id);

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
          Trage deine Tageswerte ein – Tageszeiten sind optional.
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
        <>
          {/* Zentrale Kennzahlen im Überblick */}
          <div className="card">
            <h2>Überblick</h2>
            {CORE_METRICS.map((metric) => {
              const value = answers[metric.id] as number | undefined;
              const timeMapping = TIMEOFDAY_MAPPING[metric.id];
              const morningValue = answers[timeMapping.morning] as number | undefined;
              const noonValue = answers[timeMapping.noon] as number | undefined;
              const eveningValue = answers[timeMapping.evening] as number | undefined;
              const isExpanded = expandedMetric === metric.id;

              return (
                <div
                  key={metric.id}
                  style={{ paddingBottom: "var(--s3)", borderBottom: "1px solid var(--border)" }}
                >
                  <button
                    type="button"
                    className="section-toggle"
                    aria-expanded={isExpanded}
                    onClick={() => toggleMetric(metric.id)}
                    style={{ marginBottom: isExpanded ? "var(--s2)" : 0 }}
                  >
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <span>{metric.label}</span>
                      {value !== undefined && (
                        <strong style={{ marginLeft: "var(--s2)" }}>{value}/10</strong>
                      )}
                    </div>
                    <span className="chev" aria-hidden="true">›</span>
                  </button>

                  {isExpanded && (
                    <div className="accordion-body" style={{ paddingTop: "var(--s2)" }}>
                      <QuestionRenderer
                        q={QUESTIONS[metric.id]}
                        value={value}
                        onChange={(v) => update(metric.id, v)}
                      />

                      <div style={{ marginTop: "var(--s4)" }}>
                        <p className="section-hint">Tageszeiten (optional)</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--s2)" }}>
                          <div>
                            <label style={{ fontSize: "0.85rem" }}>Morgens</label>
                            <QuestionRenderer
                              q={QUESTIONS[timeMapping.morning]}
                              value={morningValue}
                              onChange={(v) => update(timeMapping.morning, v)}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: "0.85rem" }}>Mittags</label>
                            <QuestionRenderer
                              q={QUESTIONS[timeMapping.noon]}
                              value={noonValue}
                              onChange={(v) => update(timeMapping.noon, v)}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: "0.85rem" }}>Abends</label>
                            <QuestionRenderer
                              q={QUESTIONS[timeMapping.evening]}
                              value={eveningValue}
                              onChange={(v) => update(timeMapping.evening, v)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ausführliche Bereiche */}
          {FULL_SECTIONS.map((section) => {
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
                    {section.questions.map((q) => (
                      <Fragment key={q.id}>
                        <QuestionRenderer q={q} value={answers[q.id]} onChange={(v) => update(q.id, v)} />
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
