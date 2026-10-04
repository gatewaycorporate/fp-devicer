import type { CalibrationArtifact } from './calibration.js';

export interface ArtifactActivation {
  artifactId: string;
  activatedAt: string;
  reason: string;
}

export const NEXT_ARTIFACT_SNAPSHOT_VERSION = 'next.artifacts.v1';

export interface ArtifactRegistrySnapshot {
  version: typeof NEXT_ARTIFACT_SNAPSHOT_VERSION;
  artifacts: readonly CalibrationArtifact[];
  activations: readonly ArtifactActivation[];
}

export interface ArtifactRegistryPersistence {
  read(): Promise<string | undefined>;
  write(snapshot: string): Promise<void>;
}

export class CalibrationArtifactRegistry {
  private readonly artifacts = new Map<string, CalibrationArtifact>();
  private readonly activations: ArtifactActivation[] = [];

  register(artifact: CalibrationArtifact): void {
    if (this.artifacts.has(artifact.id)) throw new Error(`Calibration artifact already registered: ${artifact.id}`);
    this.artifacts.set(artifact.id, structuredClone(artifact));
  }

  get(id: string): CalibrationArtifact | undefined {
    const artifact = this.artifacts.get(id);
    return artifact ? structuredClone(artifact) : undefined;
  }

  activate(id: string, reason: string, activatedAt = new Date()): ArtifactActivation {
    if (!this.artifacts.has(id)) throw new Error(`Unknown calibration artifact: ${id}`);
    if (!reason.trim()) throw new Error("Activation reason is required");
    const activation = { artifactId: id, activatedAt: activatedAt.toISOString(), reason };
    this.activations.push(activation);
    return activation;
  }

  active(): CalibrationArtifact | undefined {
    const activation = this.activations.at(-1);
    return activation ? this.get(activation.artifactId) : undefined;
  }

  rollback(id: string, reason: string, activatedAt = new Date()): ArtifactActivation {
    return this.activate(id, `rollback: ${reason}`, activatedAt);
  }

  activationHistory(): readonly ArtifactActivation[] {
    return this.activations.map(activation => ({ ...activation }));
  }

  snapshot(): ArtifactRegistrySnapshot {
    return {
      version: NEXT_ARTIFACT_SNAPSHOT_VERSION,
      artifacts: [...this.artifacts.values()].map(artifact => structuredClone(artifact)),
      activations: this.activationHistory(),
    };
  }

  restore(snapshot: ArtifactRegistrySnapshot): void {
    if (snapshot.version !== NEXT_ARTIFACT_SNAPSHOT_VERSION) throw new Error('Unsupported artifact snapshot version');
    const artifacts = new Map<string, CalibrationArtifact>();
    for (const artifact of snapshot.artifacts) {
      if (artifacts.has(artifact.id)) throw new Error(`Duplicate calibration artifact: ${artifact.id}`);
      artifacts.set(artifact.id, structuredClone(artifact));
    }
    for (const activation of snapshot.activations) {
      if (!artifacts.has(activation.artifactId)) throw new Error(`Activation references unknown artifact: ${activation.artifactId}`);
    }
    this.artifacts.clear();
    this.activations.length = 0;
    for (const [id, artifact] of artifacts) this.artifacts.set(id, artifact);
    this.activations.push(...snapshot.activations.map(activation => ({ ...activation })));
  }
}

export interface PersistentCalibrationArtifactRegistry {
  init(): Promise<void>;
  register(artifact: CalibrationArtifact): Promise<void>;
  get(id: string): Promise<CalibrationArtifact | undefined>;
  activate(id: string, reason: string, activatedAt?: Date): Promise<ArtifactActivation>;
  active(): Promise<CalibrationArtifact | undefined>;
  rollback(id: string, reason: string, activatedAt?: Date): Promise<ArtifactActivation>;
  activationHistory(): Promise<readonly ArtifactActivation[]>;
}

export function createPersistentCalibrationArtifactRegistry(
  persistence: ArtifactRegistryPersistence,
): PersistentCalibrationArtifactRegistry {
  const registry = new CalibrationArtifactRegistry();
  let initialized = false;

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    const encoded = await persistence.read();
    if (encoded !== undefined) {
      let snapshot: ArtifactRegistrySnapshot;
      try {
        snapshot = JSON.parse(encoded) as ArtifactRegistrySnapshot;
      } catch {
        throw new Error('Artifact snapshot is not valid JSON');
      }
      registry.restore(snapshot);
    }
    initialized = true;
  };

  const commit = async (): Promise<void> => {
    await persistence.write(JSON.stringify(registry.snapshot()));
  };

  const mutate = async <T>(operation: () => T): Promise<T> => {
    await ensureInitialized();
    const before = registry.snapshot();
    try {
      const result = operation();
      await commit();
      return result;
    } catch (error) {
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