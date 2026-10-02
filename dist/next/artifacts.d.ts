import type { CalibrationArtifact } from './calibration.js';
export interface ArtifactActivation {
    artifactId: string;
    activatedAt: string;
    reason: string;
}
export declare const NEXT_ARTIFACT_SNAPSHOT_VERSION = "next.artifacts.v1";
export interface ArtifactRegistrySnapshot {
    version: typeof NEXT_ARTIFACT_SNAPSHOT_VERSION;
    artifacts: readonly CalibrationArtifact[];
    activations: readonly ArtifactActivation[];
}
export interface ArtifactRegistryPersistence {
    read(): Promise<string | undefined>;
    write(snapshot: string): Promise<void>;
}
export declare class CalibrationArtifactRegistry {
    private readonly artifacts;
    private readonly activations;
    register(artifact: CalibrationArtifact): void;
    get(id: string): CalibrationArtifact | undefined;
    activate(id: string, reason: string, activatedAt?: Date): ArtifactActivation;
    active(): CalibrationArtifact | undefined;
    rollback(id: string, reason: string, activatedAt?: Date): ArtifactActivation;
    activationHistory(): readonly ArtifactActivation[];
    snapshot(): ArtifactRegistrySnapshot;
    restore(snapshot: ArtifactRegistrySnapshot): void;
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
export declare function createPersistentCalibrationArtifactRegistry(persistence: ArtifactRegistryPersistence): PersistentCalibrationArtifactRegistry;
//# sourceMappingURL=artifacts.d.ts.map