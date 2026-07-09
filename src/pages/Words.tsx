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

  const [formOpen, setFormOpen] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openWordId, setOpenWordId] = useState<string | null>(null);

  const [resetScope, setResetScope] = useState(""); // "" = alle Wörter, sonst Kategoriename
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    setFormOpen(false);
    load();
  };

  const remove = async (w: WordRow) => {
    if (
      !window.confirm(
        `Wort „${w.word}“ wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`
      )
    ) {
      return;
    }
    const { error } = await supabase.from("user_words").delete().eq("id", w.id);
    if (error) setError(error.message);
    else setWords((prev) => prev.filter((x) => x.id !== w.id));
  };

  const groups = useMemo(() => groupByCategory(words), [words]);

  // Setzt ausschließlich die Quizstatistik-Felder zurück – Wort, Kategorie,
  // Definitionen und Beispiele bleiben unverändert. Nur Daten des angemeldeten
  // Nutzers (RLS + user_id-Filter), begrenzt auf die betroffenen Wort-IDs.
  const resetStats = async () => {
    const targets = resetScope
      ? groups.find((g) => g.category === resetScope)?.words ?? []
      : words;
    if (!targets.length) {
      setResetMsg({ ok: false, text: "Keine passenden Wörter gefunden." });
      return;
    }
    const scopeText = resetScope ? `der Kategorie „${resetScope}“` : "aller Wörter";
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
    await load(); // UI (und damit der Quizalgorithmus beim nächsten Start) sofort aktualisieren
    setResetMsg({
      ok: true,
      text: `Quizstatistik ${scopeText} für ${targets.length} Wörter zurückgesetzt.`,
    });
  };

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
      <div className="row-between">
        <h1 style={{ margin: 0 }}>Wörter</h1>
        <button
          type="button"
          className="btn"
          aria-expanded={formOpen}
          onClick={() => setFormOpen((v) => !v)}
        >
          {formOpen ? "Schließen" : "＋ Wort"}
        </button>
      </div>

      {formOpen && (
        <div className="card accordion-body">
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
            {error && <p className="status error">{error}</p>}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Speichert…" : "Hinzufügen"}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2>Meine Wörter ({words.length})</h2>

        {loading && (
          <>
            <div className="skeleton skel-line w60" />
            <div className="skeleton skel-line w40" />
            <div className="skeleton skel-line w80" />
          </>
        )}
        {!loading && error && !formOpen && (
          <div className="alert">
            <span className="alert-ico" aria-hidden="true">!</span>
            <div>Wörter konnten nicht geladen werden. Bitte später erneut versuchen.</div>
          </div>
        )}
        {!loading && !words.length && (
          <div className="empty">
            <span className="empty-ico" aria-hidden="true">📖</span>
            <p className="empty-title">Noch keine Wörter</p>
            <p>Füge über „＋ Wort" dein erstes Wort hinzu.</p>
          </div>
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
                  {group.category}
                  <span className="cat-count">{group.words.length}</span>
                </span>
                <span className="chev" aria-hidden="true">›</span>
              </button>

              {open && (
                <div className="cat-words accordion-body">
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
                          <p className="word-stat">
                            {w.review_count}× abgefragt
                            {rate !== null && ` · ${Math.round(rate * 100)}% richtig`}
                          </p>

                          {detail && (
                            <div className="word-detail">
                              {w.definition && <p>{w.definition}</p>}
                              {w.definition2 && <p>{w.definition2}</p>}
                              {w.example && <p className="muted small">{w.example}</p>}
                              {w.example2 && <p className="muted small">{w.example2}</p>}
                              <p className="word-stat">
                                {w.correct_count} richtig · {w.wrong_count} falsch
                                {(w.partial_count > 0 || w.unknown_count > 0) &&
                                  ` · ${w.partial_count} teilweise, ${w.unknown_count} nicht gewusst (früher)`}
                              </p>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="icon-btn danger"
                          aria-label={`${w.word} löschen`}
                          title="Löschen"
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

      {words.length > 0 && (
        <div className="card">
          <h2>Quizstatistik zurücksetzen</h2>
          <p className="section-hint">
            Setzt nur die Quizbewertungen zurück. Wörter, Kategorien, Erklärungen und
            Beispiele bleiben erhalten.
          </p>
          <label htmlFor="reset-scope">Umfang</label>
          <select
            id="reset-scope"
            value={resetScope}
            onChange={(e) => {
              setResetScope(e.target.value);
              setResetMsg(null);
            }}
          >
            <option value="">Alle Wörter</option>
            {groups.map((g) => (
              <option key={g.category} value={g.category}>
                {g.category} ({g.words.length})
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
            className="btn-danger btn-block"
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

      <Link className="primary" to="/words/quiz" style={{ textDecoration: "none" }}>
        Quiz starten
      </Link>
      <p className="section-hint" style={{ textAlign: "center", marginTop: "var(--s2)" }}>
        Modus, Kategorie und Anzahl der Fragen wählst du im Quizbereich.
      </p>
    </div>
  );
}
