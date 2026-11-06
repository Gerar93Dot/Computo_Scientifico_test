import { z } from "zod";
export const memberSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
});
export const expenseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  cents: z.number().int().positive().max(100000000),
  payer: z.string().uuid(),
  participants: z.array(z.string().uuid()).min(1).max(100),
  kind: z.enum(["producto", "directo"]),
  date: z.string().datetime(),
  archived: z.boolean(),
  event: z.string().max(100).optional(),
});
export const groupSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(100),
    currency: z.enum(["MXN", "EUR", "USD"]),
    members: z.array(memberSchema).max(100),
    expenses: z.array(expenseSchema).max(5000),
  })
  .superRefine((g, ctx) => {
    const ids = new Set(g.members.map((m) => m.id));
    const names = new Set(g.members.map((m) => m.name.toLocaleLowerCase()));
    if (ids.size !== g.members.length || names.size !== g.members.length)
      ctx.addIssue({ code: "custom", message: "Hay miembros duplicados." });
    if (new Set(g.expenses.map((e) => e.id)).size !== g.expenses.length)
      ctx.addIssue({ code: "custom", message: "Hay gastos duplicados." });
    for (const e of g.expenses)
      if (
        !ids.has(e.payer) ||
        e.participants.some((p) => !ids.has(p)) ||
        new Set(e.participants).size !== e.participants.length
      )
        ctx.addIssue({
          code: "custom",
          message: "Revisa el pagador y los participantes.",
        });
  });
export type Group = z.infer<typeof groupSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export const emptyGroup = (): Group => ({
  version: 1,
  name: "Mi grupo",
  currency: "MXN",
  members: [],
  expenses: [],
});
export function money(cents: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(
    cents / 100,
  );
}
// Accept both 1,234.56 and 1.234,56, but never silently round extra decimals.
export function parseMoney(value: string): number {
  let s = value
    .trim()
    .replace(/[$€\s]/g, "")
    .replace(/(?:MXN|USD|EUR)/gi, "");
  if (!s || !/^[\d.,]+$/.test(s))
    throw Error("Escribe un importe positivo con hasta dos decimales.");
  const dot = s.lastIndexOf("."),
    comma = s.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? "." : ",";
    const thousand = decimal === "." ? "," : ".";
    s = s.split(thousand).join("").replace(decimal, ".");
  } else if (comma >= 0) s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw Error("Usa hasta dos decimales; por ejemplo, 35.50.");
  const [whole, part = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(part.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000)
    throw Error("El importe debe ser mayor que cero y hasta 1,000,000.");
  return cents;
}
export function balances(g: Group, kind?: Expense["kind"]) {
  const values = Object.fromEntries(
    g.members.map((m) => [m.id, { paid: 0, owed: 0, balance: 0 }]),
  );
  for (const e of g.expenses.filter(
    (e) => !e.archived && (!kind || e.kind === kind),
  )) {
    values[e.payer].paid += e.cents;
    // Stable order assigns leftover cents deterministically; nothing is lost.
    const ids = [...e.participants].sort();
    const base = Math.floor(e.cents / ids.length),
      rem = e.cents % ids.length;
    ids.forEach((id, i) => (values[id].owed += base + (i < rem ? 1 : 0)));
  }
  for (const v of Object.values(values)) v.balance = v.paid - v.owed;
  return values;
}
export function settlements(g: Group) {
  const b = balances(g);
  const debt = Object.entries(b)
    .filter(([, v]) => v.balance < 0)
    .map(([id, v]) => ({ id, left: -v.balance }));
  const credit = Object.entries(b)
    .filter(([, v]) => v.balance > 0)
    .map(([id, v]) => ({ id, left: v.balance }));
  const result: { from: string; to: string; cents: number }[] = [];
  let i = 0,
    j = 0;
  while (i < debt.length && j < credit.length) {
    const cents = Math.min(debt[i].left, credit[j].left);
    result.push({ from: debt[i].id, to: credit[j].id, cents });
    debt[i].left -= cents;
    credit[j].left -= cents;
    if (!debt[i].left) i++;
    if (!credit[j].left) j++;
  }
  return result;
}
export function importLegacy(input: unknown): Group {
  const modern = groupSchema.safeParse(input);
  if (modern.success) return modern.data;
  const old = z
    .object({
      personas: z.array(z.string().trim().min(1)),
      productos: z.array(
        z.object({
          nombre: z.string(),
          precio: z.number().positive(),
          pagador: z.string(),
          participantes: z.array(z.string()),
          tipo: z.enum(["producto", "directo"]).optional(),
          fecha: z.string().optional(),
          archivado: z.boolean().optional(),
          evento: z.string().optional(),
        }),
      ),
    })
    .parse(input);
  const members = old.personas.map((name) => ({
    id: crypto.randomUUID(),
    name,
  }));
  const id = (name: string) => {
    const m = members.find((m) => m.name === name);
    if (!m)
      throw Error(
        `El archivo contiene una persona sin asignar: ${name}. Corrígela antes de importar.`,
      );
    return m.id;
  };
  return groupSchema.parse({
    version: 1,
    name: "Grupo importado",
    currency: "MXN",
    members,
    expenses: old.productos.map((p) => ({
      id: crypto.randomUUID(),
      name: p.nombre,
      cents: Math.round(p.precio * 100),
      payer: id(p.pagador),
      participants: p.participantes.map(id),
      kind: p.tipo ?? "producto",
      date: p.fecha
        ? new Date(p.fecha).toISOString()
        : new Date().toISOString(),
      archived: p.archivado ?? false,
      event: p.evento,
    })),
  });
}
