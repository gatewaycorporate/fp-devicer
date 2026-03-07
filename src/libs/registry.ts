import type { Comparator } from "../types/data";
import { initializeDefaultRegistry } from "./defaults";

interface RegistryState {
  comparators: Record<string, Comparator>;
  weights: Record<string, number>;
  defaultWeight: number;
}

let registry: RegistryState = {
  comparators: {},
  weights: {},
  defaultWeight: 5,
};

let defaultsInitialized = false;

/** Internal helper – called automatically on first use */
function ensureDefaults(): void {
  if (!defaultsInitialized) {
    initializeDefaultRegistry();
    defaultsInitialized = true;
  }
}

/** Register a custom similarity comparator for a field or nested path */
export function registerComparator(path: string, comparator: Comparator): void {
  if (typeof comparator !== "function") {
    throw new Error("Comparator must be a function returning a 0–1 similarity score");
  }
  registry.comparators[path] = comparator;
}

/** Register (or override) the weight for a field or nested path */
export function registerWeight(path: string, weight: number): void {
  if (typeof weight !== "number" || weight < 0) {
    throw new Error("Weight must be a non-negative number");
  }
  registry.weights[path] = weight;
}

/** Convenience: register weight + comparator in one call (most common pattern) */
export function registerPlugin(
  path: string,
  config: { weight?: number; comparator?: Comparator }
): void {
  if (config.weight !== undefined) registerWeight(path, config.weight);
  if (config.comparator !== undefined) registerComparator(path, config.comparator);
}

/** Change the fallback weight for any unregistered field */
export function setDefaultWeight(weight: number): void {
  registry.defaultWeight = Math.max(0, weight);
}

/** Remove a registered comparator */
export function unregisterComparator(path: string): boolean {
  return delete registry.comparators[path];
}

/** Remove a registered weight */
export function unregisterWeight(path: string): boolean {
  return delete registry.weights[path];
}

/** Reset everything (perfect for tests) */
export function clearRegistry(): void {
  registry = { comparators: {}, weights: {}, defaultWeight: 5 };
}

// Internal only – used by createConfidenceCalculator
export function getGlobalRegistry(): Readonly<RegistryState> {
  ensureDefaults();
  return {
    ...registry,
    comparators: { ...registry.comparators },
    weights: { ...registry.weights },
  };
}

export { initializeDefaultRegistry };