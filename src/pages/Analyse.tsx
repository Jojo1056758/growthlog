import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Answers } from "../lib/schema";

interface EntryRow {
  entry_date: string;
  answers: Answers;
}

const METRICS: { id: string; label: string }[] = [
  { id: "mood_overall", label: "Gesamtstimmung" },
  { id: "energy", label: "Energie" },
  { id: "motivation", label: "Motivation" },
  { id: "stress", label: "Stress" },
  { id: "focus", label: "Fokus" },
  { id: "calm", label: "Innere Ruhe" },
];

const TIMEFRAMES = [
  { id: "day", label: "Tag" },
  { id: "week", label: "Woche (7 Tage)" },
  { id: "month", label: "Monat (30 Tage)" },
  { id: "year", label: "Jahr (alle)" },
];

const VIEWS = [
  { id: "daily", label: "Tageswert" },
  { id: "morning", label: "Morgens" },
  { id: "noon", label: "Mittags" },
  { id: "evening", label: "Abends" },
];

const TIMEOFDAY_MAPPING: Record<string, { morning: string; noon: string; evening: string }> = {
  mood_overall: { morning: "mood_morning", noon: "mood_noon", evening: "mood_evening" },
  energy: { morning: "energy_morning", noon: "energy_noon", evening: "energy_evening" },
  motivation: { morning: "motivation_morning", noon: "motivation_noon", evening: "motivation_evening" },
  stress: { morning: "stress_morning", noon: "stress_noon", evening: "stress_evening" },
  focus: { morning: "focus_morning", noon: "focus_noon", evening: "focus_evening" },
  calm: { morning: "calm_morning", noon: "calm_noon", evening: "calm_evening" },
};

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

interface DataPoint {
  date: string;
  value: number;
}

// SVG Liniengraph
const LineChart = ({ data, metric }: { data: DataPoint[]; metric: string }) => {
  if (data.length === 0) {
    return <p className="stat-sub">Keine Daten für diese Auswahl.</p>;
  }

  const values = data.map((d) => d.value);
  const minVal = 1;
  const maxVal = 10;
  const padding = 40;
  const width = 400;
  const height = 200;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;

  const xStep = graphWidth / Math.max(data.length - 1, 1);
  const yRange = maxVal - minVal || 1;
  const yScale = graphHeight / yRange;

  // Punkte berechnen
  const points = data.map((d, i) => {
    const x = padding + i * xStep;
    const y = padding + graphHeight - (d.value - minVal) * yScale;
    return { x, y };
  });

  // Linie als Path
  const pathData = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");

  // X-Achsen-Labels (nur jeden 3. anzeigen wenn viele Datenpunkte)
  const xLabels = data.map((d, i) => {
    const show = data.length <= 7 || i % Math.ceil(data.length / 5) === 0;
    const x = padding + i * xStep;
    if (!show) return null;
    const shortDate = d.date.slice(5); // MM-DD
    return (
      <text key={i} x={x} y={height - 15} textAnchor="middle" fontSize="12" fill="var(--muted)">
        {shortDate}
      </text>
    );
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxHeight: "300px" }}>
      {/* Y-Achse */}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />
      {/* X-Achse */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />

      {/* Y-Achsen-Labels */}
      {[1, 4, 7, 10].map((val) => {
        const y = padding + graphHeight - (val - minVal) * yScale;
        return (
          <g key={val}>
            <line x1={padding - 5} y1={y} x2={padding} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
              {val}
            </text>
          </g>
        );
      })}

      {/* X-Achsen-Labels */}
      {xLabels}

      {/* Liniengraph */}
      <path d={pathData} stroke="var(--accent)" strokeWidth="2" fill="none" />

      {/* Punkte */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--accent)" />
      ))}
    </svg>
  );
};

// SVG Tages-Graph: Tageszeitwerte (morgens/mittags/abends) auf der X-Achse,
// der allgemeine Tageswert wird separat als Referenzlinie markiert.
const DayChart = ({
  slots,
  dayValue,
}: {
  slots: { label: string; value: number | undefined }[];
  dayValue: number | undefined;
}) => {
  const present = slots.filter((s) => s.value !== undefined);
  if (present.length === 0 && dayValue === undefined) {
    return <p className="stat-sub">Keine Werte für diesen Tag.</p>;
  }

  const minVal = 1;
  const maxVal = 10;
  const padding = 40;
  const width = 400;
  const height = 200;
  const graphWidth = width - padding * 2;
  const graphHeight = height - padding * 2;
  const yRange = maxVal - minVal || 1;
  const yScale = graphHeight / yRange;

  const xStep = graphWidth / Math.max(slots.length - 1, 1);
  const yFor = (v: number) => padding + graphHeight - (v - minVal) * yScale;

  // Nur tatsächlich vorhandene Tageszeitwerte, chronologisch verbunden.
  const timePoints = slots
    .map((s, i) => (s.value !== undefined ? { x: padding + i * xStep, y: yFor(s.value) } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  const pathData = timePoints
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxHeight: "300px" }}>
      {/* Y-Achse */}
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />
      {/* X-Achse */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--border)" strokeWidth="1" />

      {/* Y-Achsen-Labels */}
      {[1, 4, 7, 10].map((val) => {
        const y = yFor(val);
        return (
          <g key={val}>
            <line x1={padding - 5} y1={y} x2={padding} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={padding - 10} y={y + 4} textAnchor="end" fontSize="12" fill="var(--muted)">
              {val}
            </text>
          </g>
        );
      })}

      {/* Allgemeiner Tageswert: separate, gestrichelte Referenzlinie */}
      {dayValue !== undefined && (
        <g>
          <line
            x1={padding}
            y1={yFor(dayValue)}
            x2={width - padding}
            y2={yFor(dayValue)}
            stroke="var(--muted)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
          <text x={width - padding} y={yFor(dayValue) - 6} textAnchor="end" fontSize="11" fill="var(--muted)">
            Tageswert {dayValue}
          </text>
        </g>
      )}

      {/* X-Achsen-Labels */}
      {slots.map((s, i) => (
        <text
          key={s.label}
          x={padding + i * xStep}
          y={height - 15}
          textAnchor="middle"
          fontSize="12"
          fill="var(--muted)"
        >
          {s.label}
        </text>
      ))}

      {/* Linie durch vorhandene Tageszeitwerte */}
      {timePoints.length > 1 && (
        <path d={pathData} stroke="var(--accent)" strokeWidth="2" fill="none" />
      )}

      {/* Punkte nur für vorhandene Tageszeitwerte */}
      {slots.map((s, i) =>
        s.value !== undefined ? (
          <circle key={s.label} cx={padding + i * xStep} cy={yFor(s.value)} r="3.5" fill="var(--accent)" />
        ) : null
      )}
    </svg>
  );
};

export default function Analyse({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMetric, setSelectedMetric] = useState("mood_overall");
  const [selectedTimeframe, setSelectedTimeframe] = useState("month");
  const [selectedView, setSelectedView] = useState("daily");
  const [selectedDay, setSelectedDay] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("daily_entries")
        .select("entry_date, answers")
        .eq("user_id", userId)
        .order("entry_date", { ascending: true })
        .limit(365);
      if (cancelled) return;
      if (error) setError(error.message);
      else setEntries((data as EntryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const last30 = useMemo(() => entries.slice(-30), [entries]);

  const averages = useMemo(
    () =>
      METRICS.map((m) => {
        const values = last30
          .map((e) => num(e.answers?.[m.id]))
          .filter((v): v is number => v !== undefined);
        const avg = values.length
          ? values.reduce((a, b) => a + b, 0) / values.length
          : undefined;
        return { ...m, avg, count: values.length };
      }),
    [last30]
  );

  const graphData = useMemo(() => {
    let filtered = entries;
    if (selectedTimeframe === "week") {
      filtered = entries.slice(-7);
    } else if (selectedTimeframe === "month") {
      filtered = entries.slice(-30);
    }

    if (selectedView === "daily") {
      // Tageswert: direkt oder Durchschnitt aus Tageszeitwerten
      return filtered
        .map((e) => {
          const directValue = num(e.answers?.[selectedMetric]);
          if (directValue !== undefined) {
            return { date: e.entry_date, value: directValue };
          }
          // Fallback: Durchschnitt aus Tageszeitwerten wenn vorhanden
          const timeMapping = TIMEOFDAY_MAPPING[selectedMetric];
          if (timeMapping) {
            const morning = num(e.answers?.[timeMapping.morning]);
            const noon = num(e.answers?.[timeMapping.noon]);
            const evening = num(e.answers?.[timeMapping.evening]);
            const values = [morning, noon, evening].filter((v): v is number => v !== undefined);
            if (values.length > 0) {
              const avg = values.reduce((a, b) => a + b, 0) / values.length;
              return { date: e.entry_date, value: avg };
            }
          }
          return null;
        })
        .filter((d): d is DataPoint => d !== null);
    }

    // Tageszeitwerte
    const timeMapping = TIMEOFDAY_MAPPING[selectedMetric];
    if (!timeMapping) {
      return [];
    }
    const timeKey =
      selectedView === "morning"
        ? timeMapping.morning
        : selectedView === "noon"
          ? timeMapping.noon
          : timeMapping.evening;
    return filtered
      .map((e) => ({
        date: e.entry_date,
        value: num(e.answers?.[timeKey]),
      }))
      .filter((d) => d.value !== undefined) as DataPoint[];
  }, [entries, selectedMetric, selectedTimeframe, selectedView]);

  // Tag-Ansicht: Liste der verfügbaren Tage (neueste zuerst) + effektiv gewählter Tag
  const availableDays = useMemo(
    () => entries.map((e) => e.entry_date).slice().reverse(),
    [entries]
  );
  const effectiveDay =
    selectedDay || (availableDays.length ? availableDays[0] : "");

  const dayChartData = useMemo(() => {
    const dayEntry = entries.find((e) => e.entry_date === effectiveDay);
    const timeMapping = TIMEOFDAY_MAPPING[selectedMetric];
    const slots = [
      { label: "Morgens", value: timeMapping ? num(dayEntry?.answers?.[timeMapping.morning]) : undefined },
      { label: "Mittags", value: timeMapping ? num(dayEntry?.answers?.[timeMapping.noon]) : undefined },
      { label: "Abends", value: timeMapping ? num(dayEntry?.answers?.[timeMapping.evening]) : undefined },
    ];
    const dayValue = num(dayEntry?.answers?.[selectedMetric]);
    return { slots, dayValue };
  }, [entries, effectiveDay, selectedMetric]);

  const streak = useMemo(() => {
    if (!entries.length) return 0;
    const dates = new Set(entries.map((e) => e.entry_date));
    let count = 0;
    const d = new Date();
    for (;;) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
      if (dates.has(iso)) {
        count += 1;
        d.setDate(d.getDate() - 1);
      } else if (count === 0) {
        d.setDate(d.getDate() - 1);
        const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
        if (!dates.has(y)) break;
      } else {
        break;
      }
    }
    return count;
  }, [entries]);

  const moodAvg = useMemo(() => {
    const vals = last30
      .map((e) => num(e.answers?.mood_overall))
      .filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
  }, [last30]);

  const currentMetricLabel = METRICS.find((m) => m.id === selectedMetric)?.label || "";

  return (
    <div className="page">
      <h1>Analyse</h1>

      {loading && (
        <>
          <div className="stat-grid" style={{ marginBottom: "var(--s3)" }}>
            <div className="skeleton skel-tile" />
            <div className="skeleton skel-tile" />
            <div className="skeleton skel-tile" />
          </div>
          <div className="card">
            <div className="skeleton skel-line w60" />
            <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
          </div>
        </>
      )}

      {error && (
        <div className="alert">
          <span className="alert-ico" aria-hidden="true">!</span>
          <div>Die Auswertung konnte nicht geladen werden. Bitte später erneut versuchen.</div>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="card empty">
          <span className="empty-ico" aria-hidden="true">📊</span>
          <p className="empty-title">Noch keine Auswertung</p>
          <p>Sobald du einige Einträge angelegt hast, erscheinen hier Trends und Durchschnitte.</p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="stat-value">{entries.length}</div>
              <div className="stat-label">Einträge gesamt</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">
                {streak}
                <span className="unit">{streak === 1 ? "Tag" : "Tage"}</span>
              </div>
              <div className="stat-label">Aktuelle Serie</div>
            </div>
            <div className="stat-tile">
              <div className="stat-value">
                {moodAvg !== undefined ? moodAvg.toFixed(1) : "–"}
                {moodAvg !== undefined && <span className="unit">/10</span>}
              </div>
              <div className="stat-label">Ø Stimmung</div>
            </div>
          </div>

          <div className="card">
            <h2>Trends</h2>
            <p className="section-hint">Wähle eine Kennzahl und einen Zeitraum aus.</p>

            <label htmlFor="metric-select">Kennzahl</label>
            <select
              id="metric-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <label htmlFor="timeframe-select" style={{ marginTop: "var(--s3)" }}>
              Zeitraum
            </label>
            <select
              id="timeframe-select"
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {selectedTimeframe === "day" ? (
              <>
                <label htmlFor="day-select" style={{ marginTop: "var(--s3)" }}>
                  Tag
                </label>
                <select
                  id="day-select"
                  value={effectiveDay}
                  onChange={(e) => setSelectedDay(e.target.value)}
                >
                  {availableDays.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label htmlFor="view-select" style={{ marginTop: "var(--s3)" }}>
                  Ansicht
                </label>
                <select
                  id="view-select"
                  value={selectedView}
                  onChange={(e) => setSelectedView(e.target.value)}
                >
                  {VIEWS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            <div style={{ marginTop: "var(--s4)", overflow: "auto" }}>
              {selectedTimeframe === "day" ? (
                <DayChart slots={dayChartData.slots} dayValue={dayChartData.dayValue} />
              ) : (
                <LineChart data={graphData} metric={selectedMetric} />
              )}
            </div>

            {selectedTimeframe === "day"
              ? dayChartData.slots.every((s) => s.value === undefined) &&
                dayChartData.dayValue === undefined && (
                  <p className="stat-sub" style={{ marginTop: "var(--s3)" }}>
                    Für die Kennzahl „{currentMetricLabel}" liegen an diesem Tag keine Werte vor.
                  </p>
                )
              : graphData.length === 0 && (
                  <p className="stat-sub" style={{ marginTop: "var(--s3)" }}>
                    Für die Kennzahl „{currentMetricLabel}" liegen für diesen Zeitraum keine Daten vor.
                  </p>
                )}
          </div>

          <div className="card">
            <h2>Durchschnitt</h2>
            <p className="section-hint">Über die letzten 30 Einträge, nur erfasste Werte.</p>
            {averages.map((m) => (
              <div className="metric-row" key={m.id}>
                <div className="metric-head">
                  <span>{m.label}</span>
                  <strong>
                    {m.avg !== undefined ? m.avg.toFixed(1) : "–"}
                    {m.avg !== undefined && <span className="muted small"> /10</span>}
                  </strong>
                </div>
                <div className="meter" aria-hidden="true">
                  <span style={{ width: m.avg !== undefined ? `${m.avg * 10}%` : "0%" }} />
                </div>
                <span className="stat-sub">{m.count}× erfasst</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
