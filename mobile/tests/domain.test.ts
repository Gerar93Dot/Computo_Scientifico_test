import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyGroup,
  balances,
  settlements,
  groupSchema,
  parseMoney,
  importLegacy,
  type Group,
} from "../src/domain";
import { parseReceipt } from "../src/receipt";
const ids = [1, 2, 3].map(
  (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
);
function fixture(): Group {
  return {
    ...emptyGroup(),
    members: ids.map((id, i) => ({ id, name: ["Ana", "Luis", "Mar"][i] })),
    expenses: [
      {
        id: crypto.randomUUID(),
        name: "Pizza",
        cents: 100,
        payer: ids[0],
        participants: ids,
        kind: "producto",
        date: new Date().toISOString(),
        archived: false,
      },
    ],
  };
}
test("reparto exacto, incluido un centavo, y liquidación que deja a todos a cero", () => {
  for (const cents of [1, 2, 100, 10001, 999999]) {
    const g = fixture();
    g.expenses[0].cents = cents;
    const b = balances(g);
    assert.equal(
      Object.values(b).reduce((s, v) => s + v.balance, 0),
      0,
    );
    assert.equal(
      Object.values(b).reduce((s, v) => s + v.owed, 0),
      cents,
    );
    for (const s of settlements(g)) {
      b[s.from].balance += s.cents;
      b[s.to].balance -= s.cents;
    }
    assert.ok(Object.values(b).every((v) => v.balance === 0));
  }
});
test("archivados no alteran saldos; directos pueden asignarse a una sola persona", () => {
  const g = fixture();
  g.expenses[0].archived = true;
  assert.equal(settlements(g).length, 0);
  g.expenses.push({
    ...g.expenses[0],
    id: crypto.randomUUID(),
    archived: false,
    kind: "directo",
    participants: [ids[1]],
    cents: 550,
  });
  assert.deepEqual(settlements(g), [{ from: ids[1], to: ids[0], cents: 550 }]);
});
test("importes con separadores, límites y entradas no válidas", () => {
  for (const s of ["1,234.56", "1.234,56", "$1234.56"])
    assert.equal(parseMoney(s), 123456);
  assert.equal(parseMoney("0,01"), 1);
  for (const s of ["0", "-1", "1.999", "NaN", "1e3", "1,2,3", "1000001"])
    assert.throws(() => parseMoney(s));
});
test("schema rechaza participantes ajenos, repetidos y pagadores eliminados", () => {
  const g = fixture();
  g.expenses[0].participants = [ids[0], ids[0]];
  assert.equal(groupSchema.safeParse(g).success, false);
  g.expenses[0].participants = [crypto.randomUUID()];
  assert.equal(groupSchema.safeParse(g).success, false);
  g.expenses[0].participants = [ids[0]];
  g.expenses[0].payer = crypto.randomUUID();
  assert.equal(groupSchema.safeParse(g).success, false);
});
test("OCR separa productos del total, pago, impuestos y descuentos", () => {
  const p = parseReceipt(
    "TIENDA\nPAN 20.00\nLECHE $35,50\n2 x AGUA 24.00\nSUBTOTAL 79.50\nIVA 0.00\nTOTAL $79.50\nEFECTIVO 100.00\nCAMBIO 20.50\nDESCUENTO 5.00\nPROMO -5.00",
  );
  assert.deepEqual(
    p.rows.map((r) => [r.name, r.amount]),
    [
      ["PAN", "20.00"],
      ["LECHE", "35.50"],
      ["2 x AGUA", "24.00"],
    ],
  );
  assert.equal(p.total, 7950);
});
test("importa versiones del escritorio y rechaza referencias huérfanas", () => {
  const old = {
    personas: ["Ana", "Luis"],
    productos: [
      {
        nombre: "Cena",
        precio: 25.99,
        pagador: "Ana",
        participantes: ["Ana", "Luis"],
      },
    ],
  };
  const g = importLegacy(old);
  assert.equal(g.expenses[0].cents, 2599);
  assert.equal(g.expenses[0].archived, false);
  assert.equal(
    Object.values(balances(g)).reduce((s, v) => s + v.balance, 0),
    0,
  );
  old.productos[0].pagador = "(Sin asignar)";
  assert.throws(() => importLegacy(old));
});
