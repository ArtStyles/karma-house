/** Keep invalid input visible to validation; never silently remove digits or signs. */
export function normalizeDecimalInput(value: string): string {
  return value.replace(/,/g, '.');
}
