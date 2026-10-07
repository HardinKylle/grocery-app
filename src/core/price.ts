// Price rules in one place: pesos <-> centavos, reading typed text, and
// showing a Price. A Price is stored in pesos with at most two decimals.

/** Pesos to whole centavos. Sums in centavos have no floating-point drift. */
export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function toPesos(centavos: number): number {
  return centavos / 100;
}

/** A Price of 0 or more pesos, in whole centavos. Throws otherwise. */
export function validPrice(price: number): number {
  const centavos = toCentavos(price);
  if (!Number.isFinite(price) || price < 0 || Math.abs(price * 100 - centavos) > 1e-6) {
    throw new Error(`Not a Price in pesos: ${price}`);
  }
  return toPesos(centavos);
}

/**
 * Reads a typed Price. Blank means no Price (null). Returns undefined when
 * the text is not a number; validPrice rejects the rest (negative, too many
 * decimals).
 */
export function parsePrice(raw: string): number | null | undefined {
  const text = raw.trim().replace(/^₱/, '').replace(/,/g, '');
  if (text === '') return null;
  if (!/^\d*\.?\d*$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** "₱42.50" */
export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const PRICE_ERROR = 'Enter pesos, like 45 or 12.50.';
