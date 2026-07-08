import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  COUNT_OPTIONS,
  QUIZ_MODES,
  QuizModeId,
  QuizSettings,
  Rating,
  RATING_LABELS,
  WORD_SELECT_COLUMNS,
  WordRow,
  buildQuizWords,
  filterByMode,
  recordAnswer,
} from "../lib/quiz";

type Step = "setup" | "session" | "results";

export default function Quiz({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [words, setWords] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("setup");
  const [settings, setSettings] = useState<QuizSettings>({
    mode: "all",
    category: null,
    count: 10,
    order: "random",
  });

  const [sessionWords, setSessionWords] = useState<WordRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<Record<string, Rating>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_words")
      .select(WORD_SELECT_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else {
      setError(null);
      setWords((data as unknown as WordRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    words.forEach((w) => {
      if (w.category) set.add(w.category);
    });
    return Array.from(set).sort();
  }, [words]);

  const availablePool = useMemo(
    () => filterByMode(words, settings.mode, settings.category),
    [words, settings.mode, settings.category]
  );

  const currentMode = QUIZ_MODES.find((m) => m.id === settings.mode)!;

  const startQuiz = (poolOverride?: WordRow[]) => {
    const list = poolOverride
      ? poolOverride
      : buildQuizWords(words, settings);
    if (!list.length) return;
    setSessionWords(list);
    setResults({});
    setCurrentIndex(0);
    setRevealed(false);
    setStep("session");
  };

  const currentWord = sessionWords[currentIndex] || null;

  const rate = async (rating: Rating) => {
    if (!currentWord || saving) return;
    setSaving(true);
    await recordAnswer(currentWord, rating);
    setSaving(false);
    setResults((prev) => ({ ...prev, [currentWord.id]: rating }));
    if (currentIndex + 1 < sessionWords.length) {
      setCurrentIndex((i) => i + 1);
      setRevealed(false);
    } else {
      load();
      setStep("results");
    }
  };

  const summary = useMemo(() => {
    const total = sessionWords.length;
    let correct = 0;
    let partial = 0;
    let wrong = 0;
    let unknown = 0;
    const problematic: WordRow[] = [];
    sessionWords.forEach((w) => {
      const r = results[w.id];
      if (r === "correct") correct++;
      else if (r === "partial") partial++;
      else if (r === "wrong") {
        wrong++;
        problematic.push(w);
      } else if (r === "unknown") {
        unknown++;
        problematic.push(w);
      }
    });
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, partial, wrong, unknown, rate, problematic };
  }, [sessionWords, results]);

  const retryProblematic = () => {
    if (!summary.problematic.length) return;
    startQuiz(summary.problematic);
  };

  const backToWords = () => navigate("/words");

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Lädt…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <p className="status error">{error}</p>
        <button type="button" className="pill" onClick={backToWords}>
          Zurück zu Wörter
        </button>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="page">
        <div className="row-between">
          <h1>Quiz starten</h1>
          <button type="button" className="icon-btn" aria-label="Abbrechen" onClick={backToWords}>
            ✕
          </button>
        </div>

        <div className="card">
          <h2>Modus</h2>
          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            {QUIZ_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pill${settings.mode === m.id ? " active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, mode: m.id as QuizModeId }))}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="muted small">{currentMode.description}</p>
        </div>

        <div className="card">
          <h2>Kategorie</h2>
          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className={`pill${settings.category === null ? " active" : ""}`}
              onClick={() => setSettings((s) => ({ ...s, category: null }))}
            >
              Alle Kategorien
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`pill${settings.category === c ? " active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, category: c }))}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Anzahl der Fragen</h2>
          <div className="row-gap" style={{ flexWrap: "wrap" }}>
            {COUNT_OPTIONS.map((c) => (
              <button
                key={String(c)}
                type="button"
                className={`pill${settings.count === c ? " active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, count: c }))}
              >
                {c === "all" ? "Alle" : c}
              </button>
            ))}
          </div>
          <p className="muted small">{availablePool.length} passende Wörter gefunden.</p>
        </div>

        {!currentMode.forcesRandomOrder && (
          <div className="card">
            <h2>Reihenfolge</h2>
            <div className="row-gap">
              <button
                type="button"
                className={`pill${settings.order === "random" ? " active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, order: "random" }))}
              >
                Zufällig
              </button>
              <button
                type="button"
                className={`pill${settings.order === "fixed" ? " active" : ""}`}
                onClick={() => setSettings((s) => ({ ...s, order: "fixed" }))}
              >
                Feste Reihenfolge
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="primary"
          disabled={!availablePool.length}
          onClick={() => startQuiz()}
        >
          {availablePool.length ? "Quiz starten" : "Keine passenden Wörter gefunden"}
        </button>
      </div>
    );
  }

  if (step === "session" && currentWord) {
    return (
      <div className="page">
        <div className="row-between">
          <button type="button" className="icon-btn" aria-label="Quiz abbrechen" onClick={backToWords}>
            ✕
          </button>
          <span className="status">
            Frage {currentIndex + 1} von {sessionWords.length} · noch{" "}
            {sessionWords.length - currentIndex} übrig
          </span>
        </div>

        <div className="card">
          {currentWord.category && <p className="muted small">{currentWord.category}</p>}
          <p className="quiz-word">{currentWord.word}</p>

          {!revealed ? (
            <button type="button" className="primary" onClick={() => setRevealed(true)}>
              Bedeutung anzeigen
            </button>
          ) : (
            <>
              <p>
                {currentWord.definition || (
                  <span className="muted">Keine Bedeutung hinterlegt.</span>
                )}
              </p>
              {currentWord.definition2 && <p>{currentWord.definition2}</p>}
              {currentWord.example && <p className="muted small">{currentWord.example}</p>}
              {currentWord.example2 && <p className="muted small">{currentWord.example2}</p>}

              <div className="row-gap" style={{ flexWrap: "wrap" }}>
                <button type="button" className="pill" disabled={saving} onClick={() => rate("correct")}>
                  {RATING_LABELS.correct}
                </button>
                <button type="button" className="pill" disabled={saving} onClick={() => rate("partial")}>
                  {RATING_LABELS.partial}
                </button>
                <button type="button" className="pill" disabled={saving} onClick={() => rate("wrong")}>
                  {RATING_LABELS.wrong}
                </button>
                <button type="button" className="pill" disabled={saving} onClick={() => rate("unknown")}>
                  {RATING_LABELS.unknown}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // step === "results"
  return (
    <div className="page">
      <h1>Ergebnis</h1>
      <div className="card">
        <div className="stat-row">
          <span>Abgefragte Wörter</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="stat-row">
          <span>{RATING_LABELS.correct}</span>
          <strong>{summary.correct}</strong>
        </div>
        <div className="stat-row">
          <span>{RATING_LABELS.partial}</span>
          <strong>{summary.partial}</strong>
        </div>
        <div className="stat-row">
          <span>{RATING_LABELS.wrong}</span>
          <strong>{summary.wrong}</strong>
        </div>
        <div className="stat-row">
          <span>{RATING_LABELS.unknown}</span>
          <strong>{summary.unknown}</strong>
        </div>
        <div className="stat-row">
          <span>Erfolgsquote</span>
          <strong>{summary.rate}%</strong>
        </div>
      </div>

      {summary.problematic.length > 0 && (
        <div className="card">
          <h2>Problematische Wörter</h2>
          {summary.problematic.map((w) => (
            <div className="word-row" key={w.id}>
              <span>{w.word}</span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={!summary.problematic.length}
        onClick={retryProblematic}
      >
        Falsche &amp; nicht gewusste Wörter erneut üben
      </button>
      <button type="button" className="pill" onClick={() => setStep("setup")}>
        Neues Quiz starten
      </button>
      <button type="button" className="pill" onClick={backToWords}>
        Zurück zum Wörterbereich
      </button>
    </div>
  );
}
