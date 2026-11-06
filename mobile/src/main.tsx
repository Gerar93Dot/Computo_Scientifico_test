import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  balances,
  emptyGroup,
  groupSchema,
  importLegacy,
  money,
  parseMoney,
  settlements,
  type Group,
  type Expense,
} from "./domain";
import { parseReceipt } from "./receipt";
import { recognize } from "./ocr";
import {
  readLocal,
  writeLocal,
  request,
  parseInvite,
  type Session,
} from "./storage";
import "./style.css";
type Draft = {
  id: string;
  name: string;
  amount: string;
  participants: string[];
};
const newRow = (): Draft => ({
  id: crypto.randomUUID(),
  name: "",
  amount: "",
  participants: [],
});
function App() {
  const [group, setGroup] = useState<Group>(emptyGroup),
    [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState("inicio"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [sync, setSync] = useState("");
  const [member, setMember] = useState(""),
    [invite, setInvite] = useState(() =>
      location.hash.startsWith("#grupo=")
        ? decodeURIComponent(location.hash.slice(7))
        : "",
    ),
    [name, setName] = useState("");
  const [rows, setRows] = useState<Draft[]>([newRow()]),
    [payer, setPayer] = useState(""),
    [kind, setKind] = useState<Expense["kind"]>("producto");
  const [ocrBusy, setOcrBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [ocrText, setOcrText] = useState(""),
    [total, setTotal] = useState<number | null>(null),
    [preview, setPreview] = useState(""),
    [event, setEvent] = useState(""),
    [filter, setFilter] = useState("todos");
  const [reviewed, setReviewed] = useState(false),
    [fromTicket, setFromTicket] = useState(false);
  const saving = useRef(false),
    sessionRef = useRef<Session | null>(null),
    revRef = useRef(0),
    version = useRef(0);
  function report(e: unknown) {
    setMessage(
      e instanceof Error ? e.message : "No se pudo completar la operación.",
    );
  }
  function apply(g: Group, r = 0) {
    setGroup(groupSchema.parse(g));
    revRef.current = r;
  }
  useEffect(() => {
    try {
      apply(readLocal());
      setReady(true);
      const stored = sessionStorage.getItem("buruburu-session");
      if (stored) {
        const saved = parseInvite(stored);
        setBusy(true);
        request(`/groups/${saved.id}`, saved)
          .then((d) => changeMode(saved, d.group, d.revision))
          .catch((e) => {
            setInvite(stored);
            setTab("grupo");
            report(e);
          })
          .finally(() => setBusy(false));
      }
    } catch {
      setMessage(
        "Los datos guardados no se pudieron leer. Exporta una copia desde este navegador antes de reemplazarlos.",
      );
    }
    if (location.hash.startsWith("#grupo=")) {
      history.replaceState(null, "", location.pathname);
      setTab("grupo");
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const generation = version.current;
    async function poll() {
      if (saving.current) return;
      try {
        const d = await request(`/groups/${session!.id}`, session!);
        if (
          !cancelled &&
          generation === version.current &&
          !saving.current &&
          d.revision >= revRef.current
        ) {
          apply(d.group, d.revision);
          setSync("Sincronizado");
        }
      } catch {
        if (!cancelled)
          setSync("Sin conexión · los cambios requieren conexión");
      }
    }
    const t = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [session]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function save(next: Group) {
    if (saving.current) throw Error("Espera a que termine el cambio anterior.");
    groupSchema.parse(next);
    saving.current = true;
    setBusy(true);
    try {
      if (sessionRef.current) {
        const s = sessionRef.current;
        try {
          const d = await request(
            `/groups/${s.id}`,
            s,
            { revision: revRef.current, group: next },
            "PUT",
          );
          apply(d.group, d.revision);
          setSync("Sincronizado");
        } catch (e) {
          if ((e as { status?: number }).status === 409) {
            const d = await request(`/groups/${s.id}`, s);
            apply(d.group, d.revision);
          }
          throw e;
        }
      } else {
        writeLocal(next);
        apply(next);
      }
      setMessage("Guardado.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function action(work: () => Promise<void>) {
    try {
      await work();
    } catch (e) {
      report(e);
    }
  }
  async function changeMode(s: Session | null, g: Group, r = 0) {
    if (s) sessionStorage.setItem("buruburu-session", `${s.id}.${s.token}`);
    else sessionStorage.removeItem("buruburu-session");
    version.current++;
    sessionRef.current = s;
    setSession(s);
    apply(g, r);
    setReady(true);
    setPayer("");
    setRows([newRow()]);
    setTotal(null);
    setOcrText("");
    setFromTicket(false);
    setPreview("");
    setSync(s ? "Sincronizado" : "");
  }
  async function share() {
    setBusy(true);
    try {
      const d = await request("/groups", undefined, group);
      await changeMode({ id: d.id, token: d.token }, d.group, d.revision);
      setMessage(
        "Grupo compartido creado. Guarda el código: permite volver a entrar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    const s = parseInvite(invite);
    setBusy(true);
    try {
      const d = await request(`/groups/${s.id}`, s);
      await changeMode(s, d.group, d.revision);
      setInvite("");
      setMessage("Ya estás en el grupo.");
    } finally {
      setBusy(false);
    }
  }
  async function scan(file: File | undefined) {
    if (!file) return;
    if (
      rows.some((r) => r.name || r.amount) &&
      !confirm("¿Reemplazar los productos que estás editando con otro ticket?")
    )
      return;
    setMessage("");
    setOcrBusy(true);
    setProgress(0);
    setReviewed(false);
    try {
      const text = await recognize(file, setProgress);
      const parsed = parseReceipt(text);
      setOcrText(text);
      setFromTicket(true);
      setTotal(parsed.total);
      setRows(
        parsed.rows.length
          ? parsed.rows.map((r) => ({
              ...r,
              id: crypto.randomUUID(),
              participants: [],
            }))
          : [newRow()],
      );
      setPreview(URL.createObjectURL(file));
      setMessage(
        parsed.rows.length
          ? `Encontré ${parsed.rows.length} posibles productos. Revisa cada importe y asígnalo.`
          : "No encontré productos claros. Puedes escribirlos o corregir el texto.",
      );
    } catch (e) {
      report(e);
    } finally {
      setOcrBusy(false);
    }
  }
  function updateRow(id: string, patch: Partial<Draft>) {
    setRows((old) => old.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setReviewed(false);
  }
  async function addExpenses() {
    if (!payer) throw Error("Elige quién pagó.");
    if (!rows.length) throw Error("Añade al menos un producto.");
    if (fromTicket && !reviewed)
      throw Error("Confirma que revisaste el ticket.");
    const expenses = rows.map((r) => {
      if (!r.name.trim()) throw Error("Escribe el nombre de cada producto.");
      if (!r.participants.length)
        throw Error(`Asigna al menos una persona a ${r.name}.`);
      return {
        id: crypto.randomUUID(),
        name: r.name.trim(),
        cents: parseMoney(r.amount),
        payer,
        participants: r.participants,
        kind,
        date: new Date().toISOString(),
        archived: false,
      };
    });
    await save({ ...group, expenses: [...group.expenses, ...expenses] });
    setRows([newRow()]);
    setOcrText("");
    setTotal(null);
    setPreview("");
    setFromTicket(false);
    setReviewed(false);
    setTab("inicio");
  }
  function exportData(raw = false) {
    const content = raw
      ? (localStorage.getItem("buruburu-local-v1") ?? "{}")
      : JSON.stringify(group, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "buruburu-gastos.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const active = group.expenses.filter((e) => !e.archived),
    archived = group.expenses.filter((e) => e.archived);
  const b = balances(group);
  const person = (id: string) =>
    group.members.find((m) => m.id === id)?.name ?? "Persona";
  let draftTotal: number | null = 0;
  try {
    draftTotal = rows.reduce((s, r) => s + parseMoney(r.amount), 0);
  } catch {
    draftTotal = null;
  }
  const invitation = session ? `${session.id}.${session.token}` : "";
  const expensesList = (list: Expense[]) =>
    list.length ? (
      <div className="expense-list">
        {[...list].reverse().map((e) => (
          <article className="expense" key={e.id}>
            <div className="expense-icon">
              {e.kind === "directo" ? "↗" : "▤"}
            </div>
            <div className="expense-info">
              <strong>{e.name}</strong>
              <span>
                Pagó {person(e.payer)} · {e.participants.map(person).join(", ")}
              </span>
              <small>
                {new Date(e.date).toLocaleDateString("es-MX")}
                {e.event ? ` · ${e.event}` : ""}
              </small>
            </div>
            <div className="expense-end">
              <strong>{money(e.cents, group.currency)}</strong>
              <button
                className="text"
                onClick={() =>
                  action(async () => {
                    if (e.archived)
                      await save({
                        ...group,
                        expenses: group.expenses.map((x) =>
                          x.id === e.id ? { ...x, archived: false } : x,
                        ),
                      });
                    else if (confirm(`¿Eliminar «${e.name}»?`))
                      await save({
                        ...group,
                        expenses: group.expenses.filter((x) => x.id !== e.id),
                      });
                  })
                }
              >
                {e.archived ? "Restaurar" : "Eliminar"}
              </button>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty">
        <span>▤</span>
        <h3>
          {tab === "historial"
            ? "Tu historial empieza aquí"
            : "Las cuentas claras, desde el inicio"}
        </h3>
        <p>
          {tab === "historial"
            ? "Archiva los gastos de una salida para conservarlos aquí."
            : "Añade a tu grupo y registra un gasto o escanea tu primer ticket."}
        </p>
      </div>
    );
  return (
    <>
      <header className="top">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("inicio");
          }}
        >
          <span className="brand-icon">▤</span> buruburu
          <span className="brand-dot">.</span>
        </a>
        <span className="mode">{session ? "● Compartido" : "◉ Personal"}</span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">GASTOS COMPARTIDOS, SIN VUELTAS</p>
            <h1>
              {tab === "inicio"
                ? "Cada quien lo suyo."
                : tab === "ticket"
                  ? "Un ticket. Todo en orden."
                  : tab === "grupo"
                    ? "Tu gente, tu grupo."
                    : tab === "saldos"
                      ? "Así quedan las cuentas."
                      : "Lo que ya compartieron."}
            </h1>
            <p className="subtitle">
              {group.name} · {group.members.length}{" "}
              {group.members.length === 1 ? "persona" : "personas"}
              {session ? ` · ${sync}` : ""}
            </p>
          </div>
          <span className="heading-mark">✳</span>
        </div>
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button aria-label="Cerrar aviso" onClick={() => setMessage("")}>
              ×
            </button>
          </div>
        )}
        {!ready ? (
          <section className="card">
            <h2>Recuperar datos</h2>
            <button onClick={() => exportData(true)}>
              Descargar datos originales
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (
                  confirm(
                    "¿Ya guardaste una copia? Esto inicia un grupo local vacío.",
                  )
                ) {
                  writeLocal(emptyGroup());
                  apply(emptyGroup());
                  setReady(true);
                }
              }}
            >
              Iniciar grupo vacío
            </button>
          </section>
        ) : (
          <fieldset disabled={busy}>
            <legend className="sr-only">Aplicación de gastos</legend>
            {tab === "inicio" && (
              <>
                <section className="hero">
                  <div>
                    <p>TOTAL DEL GRUPO</p>
                    <strong className="hero-amount">
                      {money(
                        active.reduce((s, e) => s + e.cents, 0),
                        group.currency,
                      )}
                      <small>{group.currency}</small>
                    </strong>
                    <span>
                      {active.length} gastos activos · Repartidos a tu manera
                    </span>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    ▤<span>✓</span>
                  </div>
                </section>
                <div className="quick-actions">
                  <button
                    onClick={() =>
                      setTab(group.members.length ? "ticket" : "grupo")
                    }
                  >
                    <span>▣</span>
                    <div>
                      Escanear ticket<small>Cámara o galería</small>
                    </div>
                    <b>↗</b>
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setTab(group.members.length ? "ticket" : "grupo");
                    }}
                  >
                    <span>＋</span>
                    <div>
                      Añadir gasto<small>Ingresa los detalles</small>
                    </div>
                    <b>↗</b>
                  </button>
                </div>
                <section className="card">
                  <div className="section-title">
                    <h2>Últimos gastos</h2>
                    <span className="badge">{active.length}</span>
                  </div>
                  {expensesList(active)}
                </section>
                {active.length > 0 && (
                  <section className="card">
                    <h2>Cerrar una salida</h2>
                    <p>
                      Archivar conserva los gastos y los retira del saldo
                      actual. No registra pagos ni liquida deudas.
                    </p>
                    <label>
                      Nombre del evento
                      <input
                        value={event}
                        maxLength={100}
                        onChange={(e) => setEvent(e.target.value)}
                        placeholder="Cena del viernes"
                      />
                    </label>
                    <button
                      className="secondary"
                      onClick={() =>
                        action(async () => {
                          if (!event.trim())
                            throw Error("Ponle un nombre al evento.");
                          if (
                            confirm(
                              "¿Archivar los gastos activos? Comprueba antes los pagos pendientes.",
                            )
                          )
                            await save({
                              ...group,
                              expenses: group.expenses.map((e) =>
                                e.archived
                                  ? e
                                  : {
                                      ...e,
                                      archived: true,
                                      event: event.trim(),
                                    },
                              ),
                            });
                        })
                      }
                    >
                      Archivar gastos activos
                    </button>
                  </section>
                )}
              </>
            )}
            {tab === "ticket" && (
              <>
                {!group.members.length ? (
                  <section className="card empty">
                    <h2>Primero, reúne al grupo</h2>
                    <p>
                      Añade a las personas para poder asignar cada producto.
                    </p>
                    <button onClick={() => setTab("grupo")}>
                      Añadir personas
                    </button>
                  </section>
                ) : (
                  <>
                    <section className="scan-card">
                      <span className="scan-symbol">▣</span>
                      <h2>Del ticket a las cuentas</h2>
                      <p>
                        Foto de frente, buena luz y todo el ticket a la vista.
                      </p>
                      <div className="scan-buttons">
                        <label className="button">
                          Tomar foto
                          <input
                            aria-label="Tomar foto"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            disabled={ocrBusy}
                            onChange={(e) => {
                              void scan(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <label className="button secondary">
                          Abrir galería
                          <input
                            aria-label="Abrir galería"
                            type="file"
                            accept="image/*"
                            disabled={ocrBusy}
                            onChange={(e) => {
                              void scan(e.target.files?.[0]);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      <small>
                        La imagen se procesa en tu dispositivo y no se envía al
                        grupo.
                      </small>
                      {ocrBusy && (
                        <p role="status">
                          Leyendo ticket… {progress}%{" "}
                          <progress max="100" value={progress} />
                        </p>
                      )}
                    </section>
                    <fieldset disabled={ocrBusy}>
                      <legend className="sr-only">Revisión del ticket</legend>
                      <section className="card">
                        <div className="section-title">
                          <h2>
                            {fromTicket ? "Revisa y reparte" : "Añade un gasto"}
                          </h2>
                          <span className="badge">{rows.length} productos</span>
                        </div>
                        {preview && (
                          <details>
                            <summary>Ver foto del ticket</summary>
                            <img
                              className="receipt-preview"
                              src={preview}
                              alt="Ticket seleccionado"
                            />
                          </details>
                        )}
                        <div className="form-grid">
                          <label>
                            ¿Quién pagó?
                            <select
                              value={payer}
                              onChange={(e) => setPayer(e.target.value)}
                            >
                              <option value="">Selecciona una persona</option>
                              {group.members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Tipo de gasto
                            <select
                              value={kind}
                              onChange={(e) =>
                                setKind(e.target.value as Expense["kind"])
                              }
                            >
                              <option value="producto">Productos</option>
                              <option value="directo">Gasto directo</option>
                            </select>
                          </label>
                        </div>
                        <p className="hint">
                          Marca quién consumió cada producto. Si eliges varias
                          personas, se divide por partes iguales. El importe es
                          el total del renglón, incluida su cantidad.
                        </p>
                        {rows.map((r, i) => (
                          <article className="product" key={r.id}>
                            <div className="product-top">
                              <span className="row-number">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <button
                                className="text"
                                aria-label={`Quitar producto ${i + 1}`}
                                onClick={() => {
                                  setRows(rows.filter((x) => x.id !== r.id));
                                  setReviewed(false);
                                }}
                              >
                                Quitar
                              </button>
                            </div>
                            <div className="product-fields">
                              <label>
                                Producto
                                <input
                                  aria-label={`Producto ${i + 1}`}
                                  value={r.name}
                                  maxLength={160}
                                  placeholder="Ej. Pizza margarita"
                                  onChange={(e) =>
                                    updateRow(r.id, { name: e.target.value })
                                  }
                                />
                              </label>
                              <label>
                                Importe ({group.currency})
                                <input
                                  aria-label={`Importe ${i + 1}`}
                                  inputMode="decimal"
                                  value={r.amount}
                                  placeholder="0.00"
                                  onChange={(e) =>
                                    updateRow(r.id, { amount: e.target.value })
                                  }
                                />
                              </label>
                            </div>
                            <div className="assignment-title">
                              <span>¿Para quién?</span>
                              <button
                                className="text"
                                onClick={() =>
                                  updateRow(r.id, {
                                    participants: group.members.map(
                                      (m) => m.id,
                                    ),
                                  })
                                }
                              >
                                Todos
                              </button>
                            </div>
                            <div className="chips">
                              {group.members.map((m) => (
                                <button
                                  aria-pressed={r.participants.includes(m.id)}
                                  className={`chip ${r.participants.includes(m.id) ? "selected" : ""}`}
                                  key={m.id}
                                  onClick={() =>
                                    updateRow(r.id, {
                                      participants: r.participants.includes(
                                        m.id,
                                      )
                                        ? r.participants.filter(
                                            (id) => id !== m.id,
                                          )
                                        : [...r.participants, m.id],
                                    })
                                  }
                                >
                                  <span>{m.name.charAt(0).toUpperCase()}</span>
                                  {m.name}
                                  {r.participants.includes(m.id) ? " ✓" : ""}
                                </button>
                              ))}
                            </div>
                          </article>
                        ))}
                        <button
                          className="secondary full"
                          onClick={() => {
                            setRows([...rows, newRow()]);
                            setReviewed(false);
                          }}
                        >
                          ＋ Añadir producto
                        </button>
                        <div className="total-line">
                          <span>Total de productos</span>
                          <strong>
                            {draftTotal === null
                              ? "Revisa los importes"
                              : money(draftTotal, group.currency)}
                          </strong>
                        </div>
                        {total !== null && (
                          <p
                            className={
                              draftTotal !== total ? "warning" : "hint"
                            }
                          >
                            Total leído del ticket:{" "}
                            {money(total, group.currency)}.
                            {draftTotal !== total
                              ? " No coincide: revisa productos, descuentos, impuestos y propina. Ajusta los importes antes de guardar."
                              : ""}
                          </p>
                        )}
                        {fromTicket && (
                          <label className="check">
                            <input
                              type="checkbox"
                              checked={reviewed}
                              onChange={(e) => setReviewed(e.target.checked)}
                            />
                            Revisé nombres, importes, ajustes y participantes;
                            guardaré estos valores.
                          </label>
                        )}
                        <button
                          className="full"
                          onClick={() => action(addExpenses)}
                        >
                          Guardar y repartir
                        </button>
                      </section>
                      {ocrText && (
                        <details className="card">
                          <summary>Texto detectado · corregir lectura</summary>
                          <textarea
                            aria-label="Texto detectado"
                            value={ocrText}
                            rows={10}
                            onChange={(e) => setOcrText(e.target.value)}
                          />
                          <button
                            className="secondary"
                            onClick={() => {
                              if (
                                confirm(
                                  "¿Reemplazar los productos y sus asignaciones con este texto?",
                                )
                              ) {
                                const p = parseReceipt(ocrText);
                                setRows(
                                  p.rows.map((r) => ({
                                    ...r,
                                    id: crypto.randomUUID(),
                                    participants: [],
                                  })),
                                );
                                setTotal(p.total);
                                setReviewed(false);
                              }
                            }}
                          >
                            Volver a detectar productos
                          </button>
                        </details>
                      )}
                    </fieldset>
                  </>
                )}
              </>
            )}
            {tab === "grupo" && (
              <>
                <section className="card">
                  <h2>Las personas del grupo</h2>
                  <form
                    className="inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const n = member.trim();
                        if (!n) throw Error("Escribe un nombre.");
                        if (
                          group.members.some(
                            (m) => m.name.toLowerCase() === n.toLowerCase(),
                          )
                        )
                          throw Error("Esa persona ya está en el grupo.");
                        await save({
                          ...group,
                          members: [
                            ...group.members,
                            { id: crypto.randomUUID(), name: n },
                          ],
                        });
                        setMember("");
                      });
                    }}
                  >
                    <label>
                      Nombre
                      <input
                        value={member}
                        maxLength={60}
                        placeholder="¿Quién se suma?"
                        onChange={(e) => setMember(e.target.value)}
                      />
                    </label>
                    <button>Añadir</button>
                  </form>
                  <div className="members">
                    {group.members.map((m, i) => (
                      <div className="member" key={m.id}>
                        <span className={`avatar avatar-${i % 4}`}>
                          {m.name[0].toUpperCase()}
                        </span>
                        <strong>{m.name}</strong>
                        <button
                          className="text"
                          onClick={() =>
                            action(async () => {
                              if (
                                group.expenses.some(
                                  (e) =>
                                    e.payer === m.id ||
                                    e.participants.includes(m.id),
                                )
                              )
                                throw Error(
                                  "Esta persona tiene gastos activos o históricos; consérvala para mantener las cuentas.",
                                );
                              await save({
                                ...group,
                                members: group.members.filter(
                                  (x) => x.id !== m.id,
                                ),
                              });
                            })
                          }
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <h2>Detalles del grupo</h2>
                  <label>
                    Nombre del grupo
                    <input
                      placeholder={group.name}
                      value={name}
                      maxLength={100}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      action(async () => {
                        if (!name.trim()) throw Error("Escribe un nombre.");
                        await save({ ...group, name: name.trim() });
                        setName("");
                      })
                    }
                  >
                    Guardar nombre
                  </button>
                  <label>
                    Moneda
                    <select
                      value={group.currency}
                      disabled={group.expenses.length > 0}
                      onChange={(e) =>
                        void action(() =>
                          save({
                            ...group,
                            currency: e.target.value as Group["currency"],
                          }),
                        )
                      }
                    >
                      <option value="MXN">Pesos mexicanos · MXN</option>
                      <option value="EUR">Euros · EUR</option>
                      <option value="USD">Dólares · USD</option>
                    </select>
                  </label>
                  <small>
                    La moneda se elige antes del primer gasto. No se convierten
                    importes.
                  </small>
                </section>
                <section className="card sharing">
                  {import.meta.env.VITE_DEMO_SHARED === "true" && (
                    <p className="warning" role="note">
                      Versión de prueba: los grupos compartidos pueden borrarse
                      cuando se reinicie el servidor. Usa datos de prueba y
                      exporta una copia si quieres conservarlos. Tu grupo personal
                      se guarda por separado en este navegador.
                    </p>
                  )}
                  <h2>
                    {session
                      ? "Un grupo, varios teléfonos"
                      : "Elige cómo llevar las cuentas"}
                  </h2>
                  <p>
                    {session
                      ? "Comparte el código con tu grupo. Quien lo tenga puede ver y editar los gastos. Guárdalo para volver a entrar."
                      : "Puedes administrarlo todo aquí o crear una copia compartida para que cada persona entre desde su teléfono."}
                  </p>
                  {session ? (
                    <>
                      <label>
                        Código de invitación
                        <textarea readOnly rows={3} value={invitation} />
                      </label>
                      <button
                        onClick={() =>
                          action(async () => {
                            const link = `${location.origin}/#grupo=${invitation}`;
                            if (navigator.share)
                              await navigator.share({
                                title: `Buruburu · ${group.name}`,
                                text: "Únete a nuestro grupo de gastos",
                                url: link,
                              });
                            else {
                              await navigator.clipboard.writeText(link);
                              setMessage("Enlace copiado.");
                            }
                          })
                        }
                      >
                        Compartir invitación
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          action(async () => {
                            await changeMode(null, readLocal());
                            setMessage(
                              "Volviste a tus datos personales. El grupo compartido sigue disponible con su código.",
                            );
                          })
                        }
                      >
                        Volver al modo personal
                      </button>
                    </>
                  ) : (
                    <button onClick={() => action(share)}>
                      Crear grupo compartido
                    </button>
                  )}
                  <div className="divider" />
                  <label>
                    Entrar a otro grupo
                    <input
                      value={invite}
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Pega el enlace o código"
                      onChange={(e) => setInvite(e.target.value)}
                    />
                  </label>
                  <button className="secondary" onClick={() => action(join)}>
                    Entrar al grupo
                  </button>
                  <small>
                    El modo compartido requiere conexión. Tu grupo personal se
                    conserva en este navegador.
                  </small>
                </section>
                <section className="card">
                  <h2>Tus datos, contigo</h2>
                  <p>
                    Descarga una copia o recupera el archivo gastos.json de tu
                    aplicación de escritorio.
                  </p>
                  <button className="secondary" onClick={() => exportData()}>
                    Exportar gastos
                  </button>
                  <label className="button secondary">
                    Importar JSON
                    <input
                      aria-label="Importar JSON"
                      type="file"
                      accept=".json,application/json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file)
                          void action(async () => {
                            if (file.size > 2 * 1024 * 1024)
                              throw Error("El archivo supera 2 MB.");
                            const imported = importLegacy(
                              JSON.parse(await file.text()),
                            );
                            if (
                              confirm(
                                "¿Reemplazar los datos del grupo actual con este archivo? Exporta primero si quieres conservarlos.",
                              )
                            )
                              await save(imported);
                          });
                      }}
                    />
                  </label>
                  <p className="hint">
                    Modo personal: los datos están en este navegador; borrarlos
                    o desinstalarlo puede eliminarlos. Exporta copias. Las fotos
                    no se guardan.
                  </p>
                </section>
                <section className="card">
                  <h2>Llévala en tu pantalla de inicio</h2>
                  <p>
                    Android: abre el menú de Chrome y elige «Instalar
                    aplicación». iPhone: en Safari, Compartir → «Añadir a
                    pantalla de inicio».
                  </p>
                </section>
              </>
            )}
            {tab === "saldos" && (
              <>
                <section className="card">
                  <h2>Quién pagó y quién consumió</h2>
                  <p>
                    Los centavos sobrantes se asignan de forma estable entre los
                    participantes. Las cuentas siempre cuadran.
                  </p>
                  {group.members.map((m, i) => (
                    <div className="balance-row" key={m.id}>
                      <span className={`avatar avatar-${i % 4}`}>
                        {m.name[0]}
                      </span>
                      <div>
                        <strong>{m.name}</strong>
                        <small>
                          Pagó {money(b[m.id].paid, group.currency)} · Consumió{" "}
                          {money(b[m.id].owed, group.currency)}
                        </small>
                      </div>
                      <strong
                        className={
                          b[m.id].balance < 0 ? "negative" : "positive"
                        }
                      >
                        {b[m.id].balance === 0
                          ? "Al día"
                          : `${b[m.id].balance > 0 ? "Recibe" : "Debe"} ${money(Math.abs(b[m.id].balance), group.currency)}`}
                      </strong>
                    </div>
                  ))}
                </section>
                <section className="card">
                  <h2>Para quedar a mano</h2>
                  <p>
                    Transferencias sugeridas. La aplicación no envía dinero.
                  </p>
                  {settlements(group).map((s, i) => (
                    <div className="transfer" key={i}>
                      <span>
                        <strong>{person(s.from)}</strong> → {person(s.to)}
                      </span>
                      <strong>{money(s.cents, group.currency)}</strong>
                    </div>
                  ))}
                  {!settlements(group).length && (
                    <div className="empty">
                      <span>✓</span>
                      <h3>No hay pagos pendientes</h3>
                    </div>
                  )}
                </section>
              </>
            )}
            {tab === "historial" && (
              <section className="card">
                <div className="section-title">
                  <h2>Gastos archivados</h2>
                  <span className="badge">{archived.length}</span>
                </div>
                <label>
                  Evento
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="todos">Todos los eventos</option>
                    {[
                      ...new Set(archived.map((e) => e.event ?? "Sin nombre")),
                    ].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {expensesList(
                  archived.filter(
                    (e) =>
                      filter === "todos" ||
                      (e.event ?? "Sin nombre") === filter,
                  ),
                )}
              </section>
            )}
          </fieldset>
        )}
        <footer>Hecho para compartir, producto por producto.</footer>
      </main>
      <nav className="bottom-nav" aria-label="Navegación principal">
        {[
          ["inicio", "⌂", "Inicio"],
          ["ticket", "▣", "Ticket"],
          ["saldos", "⇄", "Saldos"],
          ["historial", "◷", "Historial"],
          ["grupo", "♧", "Grupo"],
        ].map(([id, icon, label]) => (
          <button
            aria-label={label}
            disabled={busy || ocrBusy}
            aria-current={tab === id ? "page" : undefined}
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setMessage("");
            }}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
