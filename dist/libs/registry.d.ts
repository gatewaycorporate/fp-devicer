import type { Comparator } from "../types/data.js";
import { initializeDefaultRegistry } from "./defaults.js";
interface RegistryState {
    comparators: Record<string, Comparator>;
    weights: Record<string, number>;
    defaultWeight: number;
}
/** Register a custom similarity comparator for a field or nested path */
export declare function registerComparator(path: string, comparator: Comparator): void;
/** Register (or override) the weight for a field or nested path */
export declare function registerWeight(path: string, weight: number): void;
/** Convenience: register weight + comparator in one call (most common pattern) */
export declare function registerPlugin(path: string, config: {
    weight?: number;
    comparator?: Comparator;
}): void;
/** Change the fallback weight for any unregistered field */
export declare function setDefaultWeight(weight: number): void;
/** Remove a registered comparator */
export declare function unregisterComparator(path: string): boolean;
/** Remove a registered weight */
export declare function unregisterWeight(path: string): boolean;
/** Reset everything (perfect for tests) */
export declare function clearRegistry(): void;
export declare function getGlobalRegistry(): Readonly<RegistryState>;
export { initializeDefaultRegistry };
//# sourceMappingURL=registry.d.ts.map