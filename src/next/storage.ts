import type { Observation } from './index.js';

export const NEXT_SNAPSHOT_VERSION = 'next.observations.v1';

export interface NextSnapshot<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
  version: typeof NEXT_SNAPSHOT_VERSION;
  domain: string;
  schemaVersion: string;
  observations: readonly Observation<TFeatures>[];
}

export interface NextObservationStore<TFeatures extends Record<string, unknown> = Record<string, unknown>> {
  save(observation: Observation<TFeatures>): Promise<void>;
  get(id: string): Promise<Observation<TFeatures> | undefined>;
  all(): Promise<readonly Observation<TFeatures>[]>;
  remove(id: string): Promise<boolean>;
  snapshot(): Promise<NextSnapshot<TFeatures>>;
  restore(snapshot: NextSnapshot<TFeatures>): Promise<void>;
  transaction<TResult>(operation: (store: NextObservationStore<TFeatures>) => Promise<TResult> | TResult): Promise<TResult>;
}

export interface NextSnapshotPersistence {
  read(): Promise<string | undefined>;
  write(snapshot: string): Promise<void>;
}

export function createInMemoryNextStore<TFeatures extends Record<string, unknown>>(
  domain: string,
  schemaVersion: string,
): NextObservationStore<TFeatures> {
  const observations = new Map<string, Observation<TFeatures>>();

  const assertObservation = (observation: Observation<TFeatures>): void => {
    if (observation.domain !== domain || observation.schemaVersion !== schemaVersion) {
      throw new Error('Observation is outside the NEXT store scope');
    }
  };

  const save = async (observation: Observation<TFeatures>): Promise<void> => {
    assertObservation(observation);
    const existing = observations.get(observation.id);
    if (existing) {
      if (stableJson(existing) !== stableJson(observation)) throw new Error(`Observation ID conflict: ${observation.id}`);
      return;
    }
    observations.set(observation.id, structuredClone(observation));
  };

  const snapshot = async (): Promise<NextSnapshot<TFeatures>> => ({
    version: NEXT_SNAPSHOT_VERSION,
    domain,
    schemaVersion,
    observations: [...observations.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(observation => structuredClone(observation)),
  });

  const restore = async (state: NextSnapshot<TFeatures>): Promise<void> => {
    validateSnapshot(state, domain, schemaVersion);
    const restored = new Map<string, Observation<TFeatures>>();
    for (const observation of state.observations) {
      if (restored.has(observation.id)) throw new Error(`Duplicate observation ID: ${observation.id}`);
      restored.set(observation.id, structuredClone(observation));
    }
    observations.clear();
    for (const [id, observation] of restored) observations.set(id, observation);
  };

  const store: NextObservationStore<TFeatures> = {
    save,
    async get(id) {
      const observation = observations.get(id);
      return observation ? structuredClone(observation) : undefined;
    },
    async all() {
      return (await snapshot()).observations;
    },
    async remove(id) {
      return observations.delete(id);
    },
    snapshot,
    restore,
    async transaction(operation) {
      const before = await snapshot();
      try {
        return await operation(store);
      } catch (error) {
        await restore(before);
        throw error;
      }
    },
  };

  return store;
}

export function createPersistentNextStore<TFeatures extends Record<string, unknown>>(
  domain: string,
  schemaVersion: string,
  persistence: NextSnapshotPersistence,
): NextObservationStore<TFeatures> & { init(): Promise<void> } {
  const memory = createInMemoryNextStore<TFeatures>(domain, schemaVersion);
  let initialized = false;

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    const encoded = await persistence.read();
    if (encoded !== undefined) {
      let snapshot: NextSnapshot<TFeatures>;
      try {
        snapshot = JSON.parse(encoded) as NextSnapshot<TFeatures>;
      } catch {
        throw new Error('NEXT snapshot is not valid JSON');
      }
      await memory.restore(snapshot);
    }
    initialized = true;
  };

  const commit = async (): Promise<void> => {
    await persistence.write(JSON.stringify(await memory.snapshot()));
  };

  const store: NextObservationStore<TFeatures> & { init(): Promise<void> } = {
    async init() {
      await ensureInitialized();
    },
    async save(observation) {
      await ensureInitialized();
      const before = await memory.snapshot();
      try {
        await memory.save(observation);
        await commit();
      } catch (error) {
        await memory.restore(before);
        throw error;
      }
    },
    async get(id) {
      await ensureInitialized();
      return memory.get(id);
    },
    async all() {
      await ensureInitialized();
      return memory.all();
    },
    async remove(id) {
      await ensureInitialized();
      const before = await memory.snapshot();
      const removed = await memory.remove(id);
      if (!removed) return false;
      try {
        await commit();
        return true;
      } catch (error) {
        await memory.restore(before);
        throw error;
      }
    },
    async snapshot() {
      await ensureInitialized();
      return memory.snapshot();
    },
    async restore(snapshot) {
      await ensureInitialized();
      const before = await memory.snapshot();
      try {
        await memory.restore(snapshot);
        await commit();
      } catch (error) {
        await memory.restore(before);
        throw error;
      }
    },
    async transaction(operation) {
      await ensureInitialized();
      const before = await memory.snapshot();
      try {
        const result = await memory.transaction(operation);
        await commit();
        return result;
      } catch (error) {
        await memory.restore(before);
        throw error;
      }
    },
  };

  return store;
}

export function validateSnapshot<TFeatures extends Record<string, unknown>>(
  snapshot: NextSnapshot<TFeatures>,
  domain: string,
  schemaVersion: string,
): void {
  if (snapshot.version !== NEXT_SNAPSHOT_VERSION) throw new Error('Unsupported NEXT snapshot version');
  if (snapshot.domain !== domain || snapshot.schemaVersion !== schemaVersion) {
    throw new Error('NEXT snapshot is outside the store scope');
  }
  if (!Array.isArray(snapshot.observations)) throw new Error('NEXT snapshot observations must be an array');
  for (const observation of snapshot.observations) {
    if (observation.domain !== domain || observation.schemaVersion !== schemaVersion) {
      throw new Error('NEXT snapshot contains an observation outside the store scope');
    }
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}