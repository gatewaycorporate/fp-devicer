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

export function createGovernedNextStore<TFeatures extends Record<string, unknown>>(
  store: NextObservationStore<TFeatures>,
  options: NextGovernanceOptions<TFeatures>,
): GovernedNextObservationStore<TFeatures> {
  if (!Number.isFinite(options.retentionMs) || options.retentionMs <= 0) throw new Error('retentionMs must be positive');
  const now = options.now ?? (() => new Date());

  const emit = async (
    action: GovernanceAction,
    observationId: string | undefined,
    outcome: NextAuditEvent['outcome'],
    reason?: string,
  ): Promise<void> => {
    await options.audit?.({
      action, domain: (await store.snapshot()).domain, observationId,
      occurredAt: now().toISOString(), outcome, ...(reason ? { reason } : {}),
    });
  };

  const allowed = async (action: GovernanceAction, observation?: Observation<TFeatures>): Promise<boolean> => {
    const result = await options.authorize?.(action, observation);
    return result !== false;
  };

  const deny = async (action: GovernanceAction, observationId?: string): Promise<never> => {
    await emit(action, observationId, 'denied', 'authorization_denied');
    throw new Error(`NEXT governance denied ${action}`);
  };

  const governed: GovernedNextObservationStore<TFeatures> = {
    async save(observation) {
      if (!(await allowed('save', observation))) await deny('save', observation.id);
      await store.save(observation);
      await emit('save', observation.id, 'completed');
    },
    async get(id) {
      const observation = await store.get(id);
      if (observation && !(await allowed('read', observation))) await deny('read', id);
      if (observation) await emit('read', id, 'completed');
      return observation;
    },
    async all() {
      const observations = await store.all();
      const visible: Observation<TFeatures>[] = [];
      for (const observation of observations) {
        if (await allowed('read', observation)) visible.push(observation);
        else await emit('read', observation.id, 'denied', 'authorization_denied');
      }
      return visible;
    },
    async remove(id) {
      if (!(await allowed('delete'))) await deny('delete', id);
      const removed = await store.remove(id);
      await emit('delete', id, removed ? 'completed' : 'denied', removed ? undefined : 'not_found');
      return removed;
    },
    snapshot: () => store.snapshot(),
    restore: async snapshot => {
      if (!(await allowed('restore'))) await deny('restore');
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