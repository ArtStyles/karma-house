type BeforeSignOut = (userId: string) => Promise<void>;
const hooks = new Set<BeforeSignOut>();
export function registerBeforeSignOut(hook: BeforeSignOut): () => void {
  hooks.add(hook); return () => { hooks.delete(hook); };
}
export async function runBeforeSignOut(userId: string): Promise<void> {
  for (const hook of [...hooks]) await hook(userId);
}
