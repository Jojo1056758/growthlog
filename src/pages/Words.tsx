import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

interface WordRow {
  id: string;
  word: string;
  definition: string;
  example: string | null;
  notes: string | null;
  review_count: number;
  correct_count: number;
}

export default function Words({ userId }: { userId: string }) {
  const [words, setWords] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [busy, setBusy] = useState(false);

  const [quizIndex, setQuizIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("user_words")
      .select("id, word, definition, example, notes, review_count, correct_count")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setWords((data as WordRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!word.trim()) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.from("user_words").insert({
      user_id: userId,
      word: word.trim(),
      definition: definition.trim(),
      example: example.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setWord("");
    setDefinition("");
    setExample("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("user_words").delete().eq("id", id);
    if (error) setError(error.message);
    else setWords((prev) => prev.filter((w) => w.id !== id));
  };

  const quizWord = useMemo(
    () => (quizIndex !== null && words[quizIndex] ? words[quizIndex] : null),
    [quizIndex, words]
  );

  const startQuiz = () => {
    if (!words.length) return;
    setQuizIndex(Math.floor(Math.random() * words.length));
    setRevealed(false);
  };

  const answer = async (correct: boolean) => {
    if (!quizWord) return;
    await supabase
      .from("user_words")
      .update({
        review_count: quizWord.review_count + 1,
        correct_count: quizWord.correct_count + (correct ? 1 : 0),
        last_reviewed_at: new Date().toISOString(),
      })
      .eq("id", quizWord.id);
    setWords((prev) =>
      prev.map((w) =>
        w.id === quizWord.id
          ? {
              ...w,
              review_count: w.review_count + 1,
              correct_count: w.correct_count + (correct ? 1 : 0),
            }
          : w
      )
    );
    startQuiz();
  };

  return (
    <div className="page">
      <h1>Wörter</h1>

      <div className="card">
        <h2>Neues Wort</h2>
        <form onSubmit={add}>
          <label htmlFor="w-word">Wort</label>
          <input
            id="w-word"
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            required
          />
          <label htmlFor="w-def">Bedeutung</label>
          <input
            id="w-def"
            type="text"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
          <label htmlFor="w-ex">Beispielsatz (optional)</label>
          <input
            id="w-ex"
            type="text"
            value={example}
            onChange={(e) => setExample(e.target.value)}
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Speichert…" : "Hinzufügen"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="row-between">
          <h2>Quiz</h2>
          <button type="button" className="pill" onClick={startQuiz} disabled={!words.length}>
            {quizWord ? "Nächstes Wort" : "Quiz starten"}
          </button>
        </div>
        {quizWord && (
          <div>
            <p className="quiz-word">{quizWord.word}</p>
            {revealed ? (
              <>
                <p>{quizWord.definition || <span className="muted">Keine Bedeutung hinterlegt.</span>}</p>
                {quizWord.example && <p className="muted small">{quizWord.example}</p>}
                <div className="row-gap">
                  <button type="button" className="pill" onClick={() => answer(true)}>
                    Gewusst ✓
                  </button>
                  <button type="button" className="pill" onClick={() => answer(false)}>
                    Nicht gewusst ✕
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="primary" onClick={() => setRevealed(true)}>
                Bedeutung anzeigen
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Meine Wörter ({words.length})</h2>
        {loading && <p className="muted">Lädt…</p>}
        {error && <p className="status error">{error}</p>}
        {!loading && !words.length && (
          <p className="muted">Noch keine Wörter gespeichert.</p>
        )}
        {words.map((w) => (
          <div className="word-row" key={w.id}>
            <div>
              <strong>{w.word}</strong>
              {w.definition && <p className="muted small">{w.definition}</p>}
              <p className="muted small">
                {w.review_count}× geübt, {w.correct_count}× gewusst
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${w.word} löschen`}
              onClick={() => remove(w.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
