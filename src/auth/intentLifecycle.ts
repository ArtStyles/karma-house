/** Callback handoff is part of access; leaving access while signed out cancels the intent. */
export function shouldClearAuthIntent(previous: string, next: string, authenticated: boolean): boolean {
  const inAccess = (path: string) => path === '/auth' || path === '/auth/callback';
  return !authenticated && inAccess(previous) && !inAccess(next);
}

/** A response from a previous visit must not navigate a screen that has been left/reopened. */
export function createAuthFocusScope() {
  let active = false;
  let generation = 0;
  return {
    enter() { active = true; generation++; },
    leave() { active = false; generation++; },
    checkpoint() { const captured = generation; return () => active && generation === captured; },
  };
}
