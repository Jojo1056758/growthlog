import { Question, ListItem, SListItem, SubField } from "../lib/schema";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Scale10({ value, onChange }: { value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="scale">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={value === n ? "scale-btn active" : "scale-btn"}
          onClick={() => onChange(value === n ? undefined : n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Ynu({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const opts = ["Ja", "Nein", "Unsicher"];
  return (
    <div className="ynu">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? "pill active" : "pill"}
          onClick={() => onChange(value === o ? undefined : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Yn({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const opts = ["Ja", "Nein"];
  return (
    <div className="ynu">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? "pill active" : "pill"}
          onClick={() => onChange(value === o ? undefined : o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={2}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
      }}
    />
  );
}

function ListField({
  items,
  onChange,
  addLabel,
}: {
  items: ListItem[];
  onChange: (items: ListItem[]) => void;
  addLabel?: string;
}) {
  const list = items.length ? items : [];
  return (
    <div className="list-field">
      {list.map((it, idx) => (
        <div className="list-row" key={it.id}>
          <AutoTextarea
            value={it.text}
            placeholder={`Punkt ${idx + 1}`}
            onChange={(t) =>
              onChange(list.map((x) => (x.id === it.id ? { ...x, text: t } : x)))
            }
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Punkt entfernen"
            onClick={() => onChange(list.filter((x) => x.id !== it.id))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="add-btn"
        onClick={() => onChange([...list, { id: uid(), text: "" }])}
      >
        {addLabel || "+ Weiteren Punkt hinzufügen"}
      </button>
    </div>
  );
}

function SListField({
  items,
  fields,
  onChange,
  addLabel,
}: {
  items: SListItem[];
  fields: SubField[];
  onChange: (items: SListItem[]) => void;
  addLabel?: string;
}) {
  const list = items.length ? items : [];
  const setField = (itemId: string, fieldId: string, value: unknown) =>
    onChange(list.map((x) => (x.id === itemId ? { ...x, [fieldId]: value } : x)));
  return (
    <div className="list-field">
      {list.map((it, idx) => (
        <div className="slist-card" key={it.id}>
          <div className="slist-head">
            <span className="muted">#{idx + 1}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Punkt entfernen"
              onClick={() => onChange(list.filter((x) => x.id !== it.id))}
            >
              ✕
            </button>
          </div>
          {fields.map((f) => (
            <div className="subfield" key={f.id}>
              <label>{f.label}</label>
              {f.type === "scale10" ? (
                <Scale10
                  value={it[f.id] as number | undefined}
                  onChange={(v) => setField(it.id, f.id, v)}
                />
              ) : f.type === "textarea" ? (
                <AutoTextarea
                  value={(it[f.id] as string) || ""}
                  onChange={(v) => setField(it.id, f.id, v)}
                />
              ) : (
                <input
                  type="text"
                  value={(it[f.id] as string) || ""}
                  onChange={(e) => setField(it.id, f.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      <button
        type="button"
        className="add-btn"
        onClick={() => onChange([...list, { id: uid() }])}
      >
        {addLabel || "+ Weiteren Punkt hinzufügen"}
      </button>
    </div>
  );
}

export function QuestionRenderer({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div className="question">
      <label className="q-label">{q.label}</label>
      {q.help && <p className="muted small">{q.help}</p>}
      {q.type === "scale10" && (
        <Scale10 value={value as number | undefined} onChange={onChange} />
      )}
      {q.type === "ynu" && <Ynu value={value as string | undefined} onChange={onChange} />}
      {q.type === "yn" && <Yn value={value as string | undefined} onChange={onChange} />}
      {q.type === "text" && (
        <input
          type="text"
          value={(value as string) || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {q.type === "textarea" && (
        <AutoTextarea value={(value as string) || ""} onChange={onChange} />
      )}
      {q.type === "list" && (
        <ListField
          items={Array.isArray(value) ? (value as ListItem[]) : []}
          onChange={onChange}
          addLabel={q.addLabel}
        />
      )}
      {q.type === "slist" && (
        <SListField
          items={Array.isArray(value) ? (value as SListItem[]) : []}
          fields={q.fields || []}
          onChange={onChange}
          addLabel={q.addLabel}
        />
      )}
    </div>
  );
}
