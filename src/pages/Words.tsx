import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MAIN_CATEGORIES, WORD_SELECT_COLUMNS, WordRow, successRate } from "../lib/quiz";

export default function Words({ userId }: { userId: string }) {
  const [words, setWords] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [word, setWord] = useState("");
  const [category, setCategory] = useState("");
  const [definition, setDefinition] = useState("");
  const [definition2, setDefinition2] = useState("");
  const [example, setExample] = useState("");
  const [example2, setExample2] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("user_words")
      .select(WORD_SELECT_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setWords((data as unknown as WordRow[]) || []);
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
      category: category.trim() || null,
      definition: definition.trim(),
      definition2: definition2.trim() || null,
      example: example.trim() || null,
      example2: example2.trim() || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setWord("");
    setCategory("");
    setDefinition("");
    setDefinition2("");
    setExample("");
    setExample2("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("user_words").delete().eq("id", id);
    if (error) setError(error.message);
    else setWords((prev) => prev.filter((w) => w.id !== id));
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
          <label htmlFor="w-cat">Kategorie (optional)</label>
          <select id="w-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Keine Kategorie</option>
            {MAIN_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label htmlFor="w-def">Bedeutung</label>
          <input
            id="w-def"
            type="text"
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
          />
          <label htmlFor="w-def2">Zweite Erklärung (optional)</label>
          <input
            id="w-def2"
            type="text"
            value={definition2}
            onChange={(e) => setDefinition2(e.target.value)}
          />
          <label htmlFor="w-ex">Beispielsatz (optional)</label>
          <input
            id="w-ex"
            type="text"
            value={example}
            onChange={(e) => setExample(e.target.value)}
          />
          <label htmlFor="w-ex2">Zweiter Beispielsatz (optional)</label>
          <input
            id="w-ex2"
            type="text"
            value={example2}
            onChange={(e) => setExample2(e.target.value)}
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Speichert…" : "Hinzufügen"}
          </button>
        </form>
      </div>

      <div className="card">
        <div className="row-between">
          <h2>Quiz</h2>
          <Link className="pill" to="/words/quiz">
            Quiz starten
          </Link>
        </div>
        <p className="muted small">
          Wähle Modus, Kategorie und Anzahl der Fragen im Quizbereich.
        </p>
      </div>

      <div className="card">
        <h2>Meine Wörter ({words.length})</h2>
        {loading && <p className="muted">Lädt…</p>}
        {error && <p className="status error">{error}</p>}
        {!loading && !words.length && (
          <p className="muted">Noch keine Wörter gespeichert.</p>
        )}
        {words.map((w) => {
          const rate = successRate(w);
          return (
            <div className="word-row" key={w.id}>
              <div>
                <strong>{w.word}</strong>
                {w.category && <span className="muted small"> · {w.category}</span>}
                {w.definition && <p className="muted small">{w.definition}</p>}
                <p className="muted small">
                  {w.review_count}× abgefragt
                  {w.review_count > 0 &&
                    ` · ${w.correct_count} richtig, ${w.partial_count} teilweise, ${w.wrong_count} falsch, ${w.unknown_count} nicht gewusst`}
                  {rate !== null && ` · ${Math.round(rate * 100)}% Erfolgsquote`}
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
          );
        })}
      </div>
    </div>
  );
}
