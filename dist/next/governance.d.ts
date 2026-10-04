import type { Observation } from './index.js';
import type { NextObservationStore } from './storage.js';
export type GovernanceAction = 'save' | 'read' | 'delete' | 'purge' | 'restore' | 'verification' | 'abstention';
export interface NextAuditEvent {
    action: GovernanceAction;
    domain: string;
    observationId?: string;
    occurredAt: string;
    outcome: 'allowed' | 'denied' | 'completed';
    reason?: string;
}
export interface NextGovernanceOptions<TFeatures extends Record<string, unknown>> {
    retentionMs: number;
    now?: () => Date;
    authorize?(action: GovernanceAction, observation?: Observation<TFeatures>): boolean | Promise<boolean>;
    audit?(event: NextAuditEvent): void | Promise<void>;
}
export interface GovernedNextObservationStore<TFeatures extends Record<string, unknown>> extends NextObservationStore<TFeatures> {
    purgeExpired(): Promise<number>;
    recordEvent(action: Exclude<GovernanceAction, 'save' | 'read' | 'delete' | 'purge' | 'restore'>, observationId: string | undefined, outcome: NextAuditEvent['outcome'], reason?: string): Promise<void>;
}
export declare function createGovernedNextStore<TFeatures extends Record<string, unknown>>(store: NextObservationStore<TFeatures>, options: NextGovernanceOptions<TFeatures>): GovernedNextObservationStore<TFeatures>;
//# sourceMappingURL=governance.d.ts.map