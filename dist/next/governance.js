export function createGovernedNextStore(store, options) {
    if (!Number.isFinite(options.retentionMs) || options.retentionMs <= 0)
        throw new Error('retentionMs must be positive');
    const now = options.now ?? (() => new Date());
    const emit = async (action, observationId, outcome, reason) => {
        await options.audit?.({
            action, domain: (await store.snapshot()).domain, observationId,
            occurredAt: now().toISOString(), outcome, ...(reason ? { reason } : {}),
        });
    };
    const allowed = async (action, observation) => {
        const result = await options.authorize?.(action, observation);
        return result !== false;
    };
    const deny = async (action, observationId) => {
        await emit(action, observationId, 'denied', 'authorization_denied');
        throw new Error(`NEXT governance denied ${action}`);
    };
    const governed = {
        async save(observation) {
            if (!(await allowed('save', observation)))
                await deny('save', observation.id);
            await store.save(observation);
            await emit('save', observation.id, 'completed');
        },
        async get(id) {
            const observation = await store.get(id);
            if (observation && !(await allowed('read', observation)))
                await deny('read', id);
            if (observation)
                await emit('read', id, 'completed');
            return observation;
        },
        async all() {
            const observations = await store.all();
            const visible = [];
            for (const observation of observations) {
                if (await allowed('read', observation))
                    visible.push(observation);
                else
                    await emit('read', observation.id, 'denied', 'authorization_denied');
            }
            return visible;
        },
        async remove(id) {
            if (!(await allowed('delete')))
                await deny('delete', id);
            const removed = await store.remove(id);
            await emit('delete', id, removed ? 'completed' : 'denied', removed ? undefined : 'not_found');
            return removed;
        },
        snapshot: () => store.snapshot(),
        restore: async (snapshot) => {
            if (!(await allowed('restore')))
                await deny('restore');
            await store.restore(snapshot);
            await emit('restore', undefined, 'completed');
        },
        transaction: operation => store.transaction(inner => operation(createGovernedNextStore(inner, options))),
        async purgeExpired() {
            const cutoff = now().getTime() - options.retentionMs;
            let purged = 0;
            for (const observation of await store.all()) {
                if (Date.parse(observation.observedAt) < cutoff && await allowed('purge', observation)) {
                    if (await store.remove(observation.id)) {
                        purged += 1;
                        await emit('purge', observation.id, 'completed', 'retention_expired');
                    }
                }
            }
            return purged;
        },
        recordEvent: (action, observationId, outcome, reason) => emit(action, observationId, outcome, reason),
    };
    return governed;
}
