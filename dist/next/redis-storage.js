import Redis from 'ioredis';
import { createPersistentNextStore } from './storage.js';
export function createRedisNextStore(redisUrl, domain, schemaVersion) {
    const client = new Redis(redisUrl ?? 'redis://localhost:6379');
    const key = `devicer:next:${domain}:${schemaVersion}`;
    const persistence = {
        async read() {
            return (await client.get(key)) ?? undefined;
        },
        async write(snapshot) {
            await client.set(key, snapshot);
        },
    };
    const store = createPersistentNextStore(domain, schemaVersion, persistence);
    const initializeStore = store.init;
    return Object.assign(store, {
        async init() {
            await client.ping();
            await initializeStore();
        },
        close: () => client.quit(),
    });
}
