/** These geometry functions also run in the UI thread as gesture worklets. */
export function filterSheetPosition(position: number, height: number): number {
  'worklet';
  if (!Number.isFinite(position) || !Number.isFinite(height) || height <= 0) return 0;
  // Soft upper boundary; the content still acknowledges an upward pull.
  if (position < 0) return position * 24 / (24 + Math.abs(position));
  return Math.min(position, height + 32);
}

export function shouldDismissFilterSheet(position: number, velocity: number, height: number): boolean {
  'worklet';
  if (!Number.isFinite(position) || !Number.isFinite(velocity) || !Number.isFinite(height) || height <= 0) return false;
  if (position < 8 || velocity < -120) return false;
  const threshold = Math.min(180, height * .28);
  return position + Math.max(0, velocity) * .18 >= threshold;
}

/** Keeps a stale animation or repeated Apply from closing/committing twice. */
export function createFilterDismissalGate(onClose: () => void) {
  let active = true;
  let closed = false;
  let pending: { ticket: number; committed: boolean } | null = null;
  return {
    activate() { if (closed) return false; active = true; return true; },
    begin(ticket: number, commit?: () => void) {
      if (!active || closed || pending || !Number.isSafeInteger(ticket) || ticket <= 0) return false;
      pending = { ticket, committed: !!commit };
      try { commit?.(); } catch (error) { pending = null; throw error; }
      return true;
    },
    interrupt() {
      if (!active || closed || pending?.committed) return false;
      pending = null;
      return true;
    },
    finish(ticket: number) {
      if (!active || closed || pending?.ticket !== ticket) return false;
      closed = true;
      pending = null;
      onClose();
      return true;
    },
    deactivate() { active = false; pending = null; },
  };
}
