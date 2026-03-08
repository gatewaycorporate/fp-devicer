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

function exactMatch(a: unknown, b: unknown): number {
	if (a === undefined || b === undefined) return 0.5;
	return a === b ? 1 : 0;
}

export function numericProximity(a: unknown, b: unknown): number {
	if (a === undefined || b === undefined) return 0.5;
	if (typeof a !== "number" || typeof b !== "number") return a === b ? 1 : 0;
	if (a === b) return 1;
	const range = Math.max(Math.abs(a), Math.abs(b), 1);
	return Math.max(0, 1 - Math.abs(a - b) / range);
}

export function screenSimilarity(screen1: any, screen2: any): number {
	if (!screen1 || !screen2) return 0.5;
	const widthSim = numericProximity(screen1.width, screen2.width);
	const heightSim = numericProximity(screen1.height, screen2.height);
	const colorDepthSim = numericProximity(screen1.colorDepth, screen2.colorDepth);
	const pixelDepthSim = numericProximity(screen1.pixelDepth, screen2.pixelDepth);
	const orientationSim = exactMatch(screen1.orientation?.type, screen2.orientation?.type);
	return (widthSim + heightSim + colorDepthSim + pixelDepthSim + orientationSim) / 5;
}