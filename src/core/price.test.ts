import { describe, expect, it } from 'vitest';
import { parsePrice, validPrice } from './price';

describe('parsePrice', () => {
  it('reads pesos, with or without ₱ and thousands commas', () => {
    expect(parsePrice(' 45 ')).toBe(45);
    expect(parsePrice('₱1,250.50')).toBe(1250.5);
  });

  it('treats blank as no Price and junk as not a number', () => {
    expect(parsePrice('  ')).toBeNull();
    expect(parsePrice('abc')).toBeUndefined();
    expect(parsePrice('-3')).toBeUndefined();
  });
});

describe('validPrice', () => {
  it('keeps up to two decimals and rejects the rest', () => {
    expect(validPrice(12.5)).toBe(12.5);
    expect(() => validPrice(1.234)).toThrow();
    expect(() => validPrice(-1)).toThrow();
  });
});
