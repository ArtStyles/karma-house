/** Keep invalid input visible to validation; never silently remove digits or signs. */
export function normalizeDecimalInput(value: string): string {
  return value.replace(/,/g, '.');
}

/**
 * The number the catalogue will actually store. «85.000» parses as 85, so the form has to be able
 * to show what it is about to publish instead of echoing the raw string back to the seller.
 */
export function publishedNumber(value: string): number | null {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  return trimmed !== '' && Number.isFinite(parsed) ? parsed : null;
}
