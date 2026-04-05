import type { StorageAdapter } from "../../types/storage.js";
/**
 * Create a volatile, in-process {@link StorageAdapter} backed by a plain
 * `Map`. All data is lost when the process exits.
 *
 * Intended for **testing and development only**. Because there is no
 * persistence layer, `linkToUser` is a no-op and `deleteOldSnapshots`
 * prunes in-memory history without tracking a deleted-row count.
 *
 * @returns A fully initialised (eager) `StorageAdapter` instance.
 *
 * @example
 * ```ts
 * const adapter = createInMemoryAdapter();
 * await adapter.init(); // no-op but keeps the API consistent
 * ```
 */
export declare function createInMemoryAdapter(): StorageAdapter;
//# sourceMappingURL=inmemory.d.ts.map