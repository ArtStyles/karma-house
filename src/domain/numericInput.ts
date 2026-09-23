/** Keep invalid input visible to validation; never silently remove digits or signs. */
export function normalizeDecimalInput(value: string): string {
  return value.replace(/,/g, '.');
}

/**
 * The one reading of a typed price or area. Cubans write «85.000» for eighty-five thousand, and no
 * price or area has three decimals, so dot-separated groups of exactly three digits are thousands.
 * «12.5» and «0.500» keep their decimal meaning. Empty or malformed input is NaN.
 */
export function parseDecimal(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return NaN;
  return Number(/^[1-9]\d{0,2}(\.\d{3})+$/.test(trimmed) ? trimmed.replace(/\./g, '') : trimmed);
}

/** The number the catalogue will actually store, or null while the field is empty or invalid. */
export function publishedNumber(value: string): number | null {
  const parsed = parseDecimal(value);
  return Number.isFinite(parsed) ? parsed : null;
}
