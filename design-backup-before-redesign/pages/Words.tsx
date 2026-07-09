import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  MAIN_CATEGORIES,
  WORD_SELECT_COLUMNS,
  WordRow,
  groupByCategory,
  successRate,
} from "../lib/quiz";

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

  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openWordId, setOpenWordId] = useState<string | null>(null);

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

  const remove = async (w: WordRow) => {
    if (!window.confirm(`Wort „${w.word}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }
    const { error } = await supabase.from("user_words").delete().eq("id", w.id);
    if (error) setError(error.message);
    else setWords((prev) => prev.filter((x) => x.id !== w.id));
  };

  const groups = useMemo(() => groupByCategory(words), [words]);

  const toggleCat = (cat: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
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
        <h2>Meine Wörter ({words.length})</h2>
        {loading && <p className="muted">Lädt…</p>}
        {error && <p className="status error">{error}</p>}
        {!loading && !words.length && (
          <p className="muted">Noch keine Wörter gespeichert.</p>
        )}

        {groups.map((group) => {
          const open = openCats.has(group.category);
          return (
            <div className="cat-section" key={group.category}>
              <button
                type="button"
                className="section-toggle"
                aria-expanded={open}
                onClick={() => toggleCat(group.category)}
              >
                <span>
                  {group.category}{" "}
                  <span className="muted small">({group.words.length})</span>
                </span>
                <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>

              {open && (
                <div className="cat-words">
                  {group.words.map((w) => {
                    const rate = successRate(w);
                    const detail = openWordId === w.id;
                    return (
                      <div className="word-row" key={w.id}>
                        <div className="word-main">
                          <button
                            type="button"
                            className="word-open"
                            aria-expanded={detail}
                            onClick={() => setOpenWordId(detail ? null : w.id)}
                          >
                            <strong>{w.word}</strong>
                            {w.definition && (
                              <span className="muted small clamp"> {w.definition}</span>
                            )}
                          </button>
                          <p className="muted small">
                            {w.review_count}× abgefragt
                            {rate !== null && ` · ${Math.round(rate * 100)}% Erfolgsquote`}
                          </p>

                          {detail && (
                            <div className="word-detail">
                              {w.definition && <p>{w.definition}</p>}
                              {w.definition2 && <p>{w.definition2}</p>}
                              {w.example && <p className="muted small">{w.example}</p>}
                              {w.example2 && <p className="muted small">{w.example2}</p>}
                              <p className="muted small">
                                {w.correct_count} richtig · {w.wrong_count} falsch
                                {(w.partial_count > 0 || w.unknown_count > 0) &&
                                  ` · ${w.partial_count} teilweise, ${w.unknown_count} nicht gewusst (früher)`}
                              </p>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${w.word} löschen`}
                          onClick={() => remove(w)}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
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
    </div>
  );
}
