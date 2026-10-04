export const NEXT_SNAPSHOT_VERSION = 'next.observations.v1';
export function createInMemoryNextStore(domain, schemaVersion) {
    const observations = new Map();
    const assertObservation = (observation) => {
        if (observation.domain !== domain || observation.schemaVersion !== schemaVersion) {
            throw new Error('Observation is outside the NEXT store scope');
        }
    };
    const save = async (observation) => {
        assertObservation(observation);
        const existing = observations.get(observation.id);
        if (existing) {
            if (stableJson(existing) !== stableJson(observation))
                throw new Error(`Observation ID conflict: ${observation.id}`);
            return;
        }
        observations.set(observation.id, structuredClone(observation));
    };
    const snapshot = async () => ({
        version: NEXT_SNAPSHOT_VERSION,
        domain,
        schemaVersion,
        observations: [...observations.values()]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(observation => structuredClone(observation)),
    });
    const restore = async (state) => {
        validateSnapshot(state, domain, schemaVersion);
        const restored = new Map();
        for (const observation of state.observations) {
            if (restored.has(observation.id))
                throw new Error(`Duplicate observation ID: ${observation.id}`);
            restored.set(observation.id, structuredClone(observation));
        }
        observations.clear();
        for (const [id, observation] of restored)
            observations.set(id, observation);
    };
    const store = {
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
            }
            catch (error) {
                await restore(before);
                throw error;
            }
        },
    };
    return store;
}
export function createPersistentNextStore(domain, schemaVersion, persistence) {
    const memory = createInMemoryNextStore(domain, schemaVersion);
    let initialized = false;
    const ensureInitialized = async () => {
        if (initialized)
            return;
        const encoded = await persistence.read();
        if (encoded !== undefined) {
            let snapshot;
            try {
                snapshot = JSON.parse(encoded);
            }
            catch {
                throw new Error('NEXT snapshot is not valid JSON');
            }
            await memory.restore(snapshot);
        }
        initialized = true;
    };
    const commit = async () => {
        await persistence.write(JSON.stringify(await memory.snapshot()));
    };
    const store = {
        async init() {
            await ensureInitialized();
        },
        async save(observation) {
            await ensureInitialized();
            const before = await memory.snapshot();
            try {
                await memory.save(observation);
                await commit();
            }
            catch (error) {
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
            if (!removed)
                return false;
            try {
                await commit();
                return true;
            }
            catch (error) {
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
            }
            catch (error) {
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
            }
            catch (error) {
                await memory.restore(before);
                throw error;
            }
        },
    };
    return store;
}
export function validateSnapshot(snapshot, domain, schemaVersion) {
    if (snapshot.version !== NEXT_SNAPSHOT_VERSION)
        throw new Error('Unsupported NEXT snapshot version');
    if (snapshot.domain !== domain || snapshot.schemaVersion !== schemaVersion) {
        throw new Error('NEXT snapshot is outside the store scope');
    }
    if (!Array.isArray(snapshot.observations))
        throw new Error('NEXT snapshot observations must be an array');
    for (const observation of snapshot.observations) {
        if (observation.domain !== domain || observation.schemaVersion !== schemaVersion) {
            throw new Error('NEXT snapshot contains an observation outside the store scope');
        }
    }
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
