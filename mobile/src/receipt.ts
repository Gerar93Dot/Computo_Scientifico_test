import { parseMoney } from "./domain";
export type ReceiptRow = { name: string; amount: string; source: string };
export function parseReceipt(text: string): {
  rows: ReceiptRow[];
  total: number | null;
} {
  const rows: ReceiptRow[] = [];
  let total: number | null = null;
  for (const source of text.split(/\r?\n/)) {
    const line = source.trim();
    if (!line) continue;
    const normal = line
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    const match = line.match(
      /(?:\$\s*)?(\d[\d.,]*[.,]\d{2})\s*(?:MXN|EUR|USD|[A-Z])?\s*$/i,
    );
    if (!match) continue;
    let cents: number;
    try {
      cents = parseMoney(match[1]);
    } catch {
      continue;
    }
    if (/^(?:IMPORTE\s+)?TOTAL(?:\s|:|\$)/.test(normal)) {
      total = cents;
      continue;
    }
    if (
      /\b(SUBTOTAL|IVA|I\.V\.A|IMPUESTO|CAMBIO|EFECTIVO|TARJETA|PAGO|RECIBIDO|AHORRO|DESCUENTO|PROPINA|TOTAL|SALDO|VISA|MASTERCARD)\b/.test(
        normal,
      )
    )
      continue;
    const name = line
      .slice(0, match.index)
      .replace(/\s+[$€]\s*$/, "")
      .trim();
    // Negative adjustments are not positive purchases and must be reviewed manually.
    if (!/[a-záéíóúñ]/i.test(name) || /-\s*$/.test(name)) continue;
    rows.push({ name, amount: (cents / 100).toFixed(2), source });
  }
  return { rows, total };
}
