/**
 * Seed the global registry with the built-in plugin definitions.
 *
 * Called automatically by {@link getGlobalRegistry} on first access;
 * safe to call manually if you need to reset defaults after clearing
 * the registry. Idempotent when called multiple times via the lazy
 * guard in `registry.ts`.
 */
export declare function initializeDefaultRegistry(): void;
//# sourceMappingURL=default-plugins.d.ts.map