export const NEXT_ARTIFACT_SNAPSHOT_VERSION = 'next.artifacts.v1';
export class CalibrationArtifactRegistry {
    artifacts = new Map();
    activations = [];
    register(artifact) {
        if (this.artifacts.has(artifact.id))
            throw new Error(`Calibration artifact already registered: ${artifact.id}`);
        this.artifacts.set(artifact.id, structuredClone(artifact));
    }
    get(id) {
        const artifact = this.artifacts.get(id);
        return artifact ? structuredClone(artifact) : undefined;
    }
    activate(id, reason, activatedAt = new Date()) {
        if (!this.artifacts.has(id))
            throw new Error(`Unknown calibration artifact: ${id}`);
        if (!reason.trim())
            throw new Error("Activation reason is required");
        const activation = { artifactId: id, activatedAt: activatedAt.toISOString(), reason };
        this.activations.push(activation);
        return activation;
    }
    active() {
        const activation = this.activations.at(-1);
        return activation ? this.get(activation.artifactId) : undefined;
    }
    rollback(id, reason, activatedAt = new Date()) {
        return this.activate(id, `rollback: ${reason}`, activatedAt);
    }
    activationHistory() {
        return this.activations.map(activation => ({ ...activation }));
    }
    snapshot() {
        return {
            version: NEXT_ARTIFACT_SNAPSHOT_VERSION,
            artifacts: [...this.artifacts.values()].map(artifact => structuredClone(artifact)),
            activations: this.activationHistory(),
        };
    }
    restore(snapshot) {
        if (snapshot.version !== NEXT_ARTIFACT_SNAPSHOT_VERSION)
            throw new Error('Unsupported artifact snapshot version');
        const artifacts = new Map();
        for (const artifact of snapshot.artifacts) {
            if (artifacts.has(artifact.id))
                throw new Error(`Duplicate calibration artifact: ${artifact.id}`);
            artifacts.set(artifact.id, structuredClone(artifact));
        }
        for (const activation of snapshot.activations) {
            if (!artifacts.has(activation.artifactId))
                throw new Error(`Activation references unknown artifact: ${activation.artifactId}`);
        }
        this.artifacts.clear();
        this.activations.length = 0;
        for (const [id, artifact] of artifacts)
            this.artifacts.set(id, artifact);
        this.activations.push(...snapshot.activations.map(activation => ({ ...activation })));
    }
}
export function createPersistentCalibrationArtifactRegistry(persistence) {
    const registry = new CalibrationArtifactRegistry();
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
                throw new Error('Artifact snapshot is not valid JSON');
            }
            registry.restore(snapshot);
        }
        initialized = true;
    };
    const commit = async () => {
        await persistence.write(JSON.stringify(registry.snapshot()));
    };
    const mutate = async (operation) => {
        await ensureInitialized();
        const before = registry.snapshot();
        try {
            const result = operation();
            await commit();
            return result;
        }
        catch (error) {
            registry.restore(before);
            throw error;
        }
    };
    return {
        init: ensureInitialized,
        async register(artifact) {
            await mutate(() => registry.register(artifact));
        },
        async get(id) {
            await ensureInitialized();
            return registry.get(id);
        },
        async activate(id, reason, activatedAt) {
            return mutate(() => registry.activate(id, reason, activatedAt));
        },
        async active() {
            await ensureInitialized();
            return registry.active();
        },
        async rollback(id, reason, activatedAt) {
            return mutate(() => registry.rollback(id, reason, activatedAt));
        },
        async activationHistory() {
            await ensureInitialized();
            return registry.activationHistory();
        },
    };
}
