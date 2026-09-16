let counter = 0;

/** Generates a reasonably unique id for mock/local usage (swap for uuid server-side ids later). */
export function generateId(prefix = "id"): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}${counter}${random}`;
}
