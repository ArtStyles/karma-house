type RefreshOptions = {
  blocked?: boolean;
  onRefreshing?(refreshing: boolean): void;
  onError?(error: unknown): void;
};

/** Locks gestures synchronously; old screen/account completions never publish UI state. */
export function createConsultationRefreshGate() {
  let context: string | null = null;
  let revision = 0;
  let active: object | null = null;
  return {
    enter(key: string) {
      if (key !== context) { context = key; revision++; active = null; }
    },
    leave() { context = null; revision++; active = null; },
    running() { return active !== null; },
    async run(work: () => Promise<unknown>, options: RefreshOptions = {}) {
      if (context === null || active || options.blocked) return false;
      const ticket = {}, captured = revision;
      active = ticket;
      options.onRefreshing?.(true);
      const current = () => captured === revision && active === ticket;
      try { await work(); }
      catch (error) { if (current()) options.onError?.(error); }
      finally {
        if (current()) { active = null; options.onRefreshing?.(false); }
      }
      return true;
    },
  };
}
