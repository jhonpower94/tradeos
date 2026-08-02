import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDuration, formatNumber, formatPercent, formatPrice } from './format';

describe('formatCurrency', () => {
  it('formats positive values', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('handles nullish values', () => {
    expect(formatCurrency(null)).toBe('—');
    expect(formatCurrency(undefined)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(formatPercent(1.234)).toBe('+1.23%');
  });

  it('does not prefix negative values', () => {
    expect(formatPercent(-3.5)).toBe('-3.50%');
  });
});

describe('formatNumber', () => {
  it('formats with fixed decimals', () => {
    expect(formatNumber(1000, 0)).toBe('1,000');
  });
});

describe('formatPrice', () => {
  it('uses more precision for small prices', () => {
    expect(formatPrice(0.0001234)).toBe('0.000123');
  });

  it('uses less precision for large prices', () => {
    expect(formatPrice(65000.123)).toBe('65,000.12');
  });
});

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(30 * 60_000)).toBe('30m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
  });

  it('formats days and hours', () => {
    expect(formatDuration(26 * 60 * 60_000)).toBe('1d 2h');
  });
});
