export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  let distance = Math.abs(a.length - b.length);
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return Math.max(0, 1 - distance / maxLen);
}

export function jaccardSimilarity(a: unknown, b: unknown): number {
  const setA = new Set<unknown>(Array.isArray(a) ? a : []);
  const setB = new Set<unknown>(Array.isArray(b) ? b : []);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}