import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  COUNT_OPTIONS,
  NewRating,
  QUIZ_MODES,
  QuizModeId,
  QuizSettings,
  RATING_LABELS,
  WORD_SELECT_COLUMNS,
  WordRow,
  buildQuizWords,
  extractCategories,
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
  const [results, setResults] = useState<Record<string, NewRating>>({});
  const [saving, setSaving] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetScope, setResetScope] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

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

  const categories = useMemo(() => extractCategories(words), [words]);

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

  const rate = async (rating: NewRating) => {
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

  const resetStats = async () => {
    const targets = resetScope
      ? words.filter((w) => w.category === resetScope)
      : words;
    if (!targets.length) {
      setResetMsg({ ok: false, text: "Keine passenden Wörter gefunden." });
      return;
    }
    const scopeText = resetScope ? `der Kategorie „${resetScope}"` : "aller Wörter";
    if (
      !window.confirm(
        `Quizstatistik ${scopeText} (${targets.length} Wörter) wirklich zurücksetzen? ` +
          `Wörter, Kategorien, Erklärungen und Beispiele bleiben erhalten.`
      )
    ) {
      return;
    }
    setResetBusy(true);
    setResetMsg(null);
    const ids = targets.map((w) => w.id);
    const { error } = await supabase
      .from("user_words")
      .update({
        review_count: 0,
        correct_count: 0,
        partial_count: 0,
        wrong_count: 0,
        unknown_count: 0,
        last_reviewed_at: null,
        last_correct_at: null,
      })
      .eq("user_id", userId)
      .in("id", ids);
    setResetBusy(false);
    if (error) {
      setResetMsg({ ok: false, text: "Zurücksetzen fehlgeschlagen. Bitte später erneut versuchen." });
      return;
    }
    await load();
    setResetMsg({
      ok: true,
      text: `Quizstatistik ${scopeText} für ${targets.length} Wörter zurückgesetzt.`,
    });
  };

  const summary = useMemo(() => {
    const total = sessionWords.length;
    let correct = 0;
    let wrong = 0;
    const problematic: WordRow[] = [];
    sessionWords.forEach((w) => {
      const r = results[w.id];
      if (r === "correct") correct++;
      else if (r === "wrong") {
        wrong++;
        problematic.push(w);
      }
    });
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, wrong, rate, problematic };
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

        {words.length > 0 && (
          <div className="card">
            <button
              type="button"
              className="section-toggle"
              aria-expanded={resetOpen}
              onClick={() => {
                setResetOpen(!resetOpen);
                setResetMsg(null);
              }}
            >
              <span>Quizstatistik verwalten</span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            {resetOpen && (
              <div className="accordion-body">
                <p className="section-hint">
                  Setzt nur die Quizbewertungen zurück. Wörter, Kategorien, Erklärungen und
                  Beispiele bleiben erhalten.
                </p>
                <label htmlFor="reset-scope-quiz">Umfang</label>
                <select
                  id="reset-scope-quiz"
                  value={resetScope}
                  onChange={(e) => {
                    setResetScope(e.target.value);
                    setResetMsg(null);
                  }}
                >
                  <option value="">Alle Wörter</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {resetMsg && (
                  <p className={resetMsg.ok ? "status" : "status error"} style={{ marginTop: "var(--s3)" }}>
                    {resetMsg.text}
                  </p>
                )}
                <button
                  type="button"
                  className="btn-danger"
                  style={{ marginTop: "var(--s3)" }}
                  disabled={resetBusy}
                  onClick={resetStats}
                >
                  {resetBusy
                    ? "Setzt zurück…"
                    : resetScope
                    ? `Statistik der Kategorie zurücksetzen`
                    : "Statistik aller Wörter zurücksetzen"}
                </button>
              </div>
            )}
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
    const progress = Math.round((currentIndex / sessionWords.length) * 100);
    return (
      <div className="page">
        <div className="row-between" style={{ marginBottom: "var(--s2)" }}>
          <button type="button" className="icon-btn" aria-label="Quiz abbrechen" onClick={backToWords}>
            ✕
          </button>
          <span className="status">
            Frage {currentIndex + 1} / {sessionWords.length}
          </span>
        </div>
        <div className="quiz-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="card quiz-card">
          {currentWord.category && <span className="quiz-cat">{currentWord.category}</span>}
          <p className="quiz-word">{currentWord.word}</p>

          {!revealed ? (
            <button type="button" className="primary" onClick={() => setRevealed(true)}>
              Lösung anzeigen
            </button>
          ) : (
            <>
              <div className="quiz-solution">
                <p className="def">
                  {currentWord.definition || (
                    <span className="muted">Keine Bedeutung hinterlegt.</span>
                  )}
                </p>
                {currentWord.definition2 && <p className="def">{currentWord.definition2}</p>}
                {currentWord.example && <p className="ex">{currentWord.example}</p>}
                {currentWord.example2 && <p className="ex">{currentWord.example2}</p>}
              </div>

              <div className="quiz-answer-row">
                <button
                  type="button"
                  className="quiz-answer-btn wrong"
                  disabled={saving}
                  onClick={() => rate("wrong")}
                >
                  {RATING_LABELS.wrong}
                </button>
                <button
                  type="button"
                  className="quiz-answer-btn correct"
                  disabled={saving}
                  onClick={() => rate("correct")}
                >
                  {RATING_LABELS.correct}
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
        <div className="result-ring">
          <div className="result-pct">{summary.rate}%</div>
          <div className="stat-sub">Erfolgsquote bei {summary.total} Wörtern</div>
          <div className="result-split">
            <span className="result-chip ok">● {summary.correct} richtig</span>
            <span className="result-chip no">● {summary.wrong} falsch</span>
          </div>
        </div>
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${summary.rate}%` }} />
        </div>
      </div>

      {summary.problematic.length > 0 && (
        <div className="card">
          <h2>Schwierige Wörter</h2>
          <div className="chip-wrap">
            {summary.problematic.map((w) => (
              <span className="word-chip" key={w.id}>
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        className="primary"
        disabled={!summary.problematic.length}
        onClick={retryProblematic}
      >
        Falsche Wörter erneut üben
      </button>
      <button type="button" className="btn-secondary" onClick={() => setStep("setup")}>
        Neues Quiz starten
      </button>
      <button type="button" className="btn-secondary" onClick={backToWords}>
        Zurück zum Wörterbereich
      </button>
    </div>
  );
}
