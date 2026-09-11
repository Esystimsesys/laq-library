/** Only library list routes can be the parent of a model detail. */
export function listReturnTo(state: unknown): string {
  const value = state && typeof state === 'object' && 'returnTo' in state ? state.returnTo : undefined
  return typeof value === 'string' && ['/', '/favorites', '/made'].includes(value.split(/[?#]/)[0]) ? value : '/'
}
