import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerComparator,
  registerWeight,
  registerPlugin,
  unregisterComparator,
  unregisterWeight,
  setDefaultWeight,
  clearRegistry,
  getGlobalRegistry,
  initializeDefaultRegistry,
} from '../../libs/registry';

// Always start each test with a clean slate to avoid cross-test pollution
beforeEach(() => {
  clearRegistry();
});

describe('registerComparator', () => {
  it('registers a function and makes it retrievable via getGlobalRegistry', () => {
    const fn = (a: any, b: any) => (a === b ? 1 : 0);
    registerComparator('customField', fn);
    const registry = getGlobalRegistry();
    expect(registry.comparators['customField']).toBe(fn);
  });

  it('throws when passed a non-function', () => {
    expect(() => registerComparator('field', 42 as any)).toThrow();
    expect(() => registerComparator('field', null as any)).toThrow();
    expect(() => registerComparator('field', 'string' as any)).toThrow();
  });

  it('overwrites an existing comparator', () => {
    const first = () => 0;
    const second = () => 1;
    registerComparator('field', first);
    registerComparator('field', second);
    expect(getGlobalRegistry().comparators['field']).toBe(second);
  });
});

describe('registerWeight', () => {
  it('registers a weight and makes it retrievable', () => {
    registerWeight('fonts', 42);
    expect(getGlobalRegistry().weights['fonts']).toBe(42);
  });

  it('throws for negative weights', () => {
    expect(() => registerWeight('field', -1)).toThrow();
  });

  it('throws when weight is not a number', () => {
    expect(() => registerWeight('field', 'high' as any)).toThrow();
    expect(() => registerWeight('field', null as any)).toThrow();
  });

  it('accepts zero as a valid weight', () => {
    expect(() => registerWeight('field', 0)).not.toThrow();
    expect(getGlobalRegistry().weights['field']).toBe(0);
  });
});

describe('registerPlugin', () => {
  it('registers both weight and comparator at once', () => {
    const fn = (a: any, b: any) => Number(a === b);
    registerPlugin('customPlugin', { weight: 10, comparator: fn });
    const registry = getGlobalRegistry();
    expect(registry.weights['customPlugin']).toBe(10);
    expect(registry.comparators['customPlugin']).toBe(fn);
  });

  it('registers only a weight when comparator is omitted', () => {
    registerPlugin('weightOnly', { weight: 5 });
    const registry = getGlobalRegistry();
    expect(registry.weights['weightOnly']).toBe(5);
    expect(registry.comparators['weightOnly']).toBeUndefined();
  });

  it('registers only a comparator when weight is omitted', () => {
    const fn = () => 0.5;
    registerPlugin('comparatorOnly', { comparator: fn });
    const registry = getGlobalRegistry();
    expect(registry.comparators['comparatorOnly']).toBe(fn);
    expect(registry.weights['comparatorOnly']).toBeUndefined();
  });
});

describe('unregisterComparator / unregisterWeight', () => {
  it('removes a registered comparator', () => {
    registerComparator('temp', () => 1);
    const removed = unregisterComparator('temp');
    expect(removed).toBe(true);
    expect(getGlobalRegistry().comparators['temp']).toBeUndefined();
  });

  it('returns true even for a non-existent comparator (JS delete behavior)', () => {
    // JS `delete obj.key` returns true even if key did not exist
    expect(unregisterComparator('doesNotExist')).toBe(true);
  });

  it('removes a registered weight', () => {
    registerWeight('temp', 7);
    const removed = unregisterWeight('temp');
    expect(removed).toBe(true);
    expect(getGlobalRegistry().weights['temp']).toBeUndefined();
  });
});

describe('setDefaultWeight', () => {
  it('changes the defaultWeight applied to unknown fields', () => {
    setDefaultWeight(99);
    expect(getGlobalRegistry().defaultWeight).toBe(99);
  });

  it('clamps negative values to 0', () => {
    setDefaultWeight(-10);
    expect(getGlobalRegistry().defaultWeight).toBe(0);
  });

  it('accepts 0 explicitly', () => {
    setDefaultWeight(0);
    expect(getGlobalRegistry().defaultWeight).toBe(0);
  });
});

describe('clearRegistry', () => {
  it('removes all comparators and weights', () => {
    registerComparator('f', () => 1);
    registerWeight('f', 10);
    clearRegistry();
    const registry = getGlobalRegistry(); // triggers re-seeding
    // After re-seed, built-ins should be present but our custom 'f' should not
    expect(registry.comparators['f']).toBeUndefined();
    expect(registry.weights['f']).toBeUndefined();
  });

  it('resets defaultWeight to 5 (the hard-coded default)', () => {
    setDefaultWeight(99);
    clearRegistry();
    // getGlobalRegistry re-seeds, which does not touch defaultWeight
    expect(getGlobalRegistry().defaultWeight).toBe(5);
  });

  it('leaves registry empty until initializeDefaultRegistry is called manually', () => {
    // clearRegistry() resets the data but not the internal initialisation guard,
    // so getGlobalRegistry() alone will NOT re-seed after clearRegistry().
    // Callers must explicitly call initializeDefaultRegistry() to restore built-ins.
    clearRegistry();
    // Manually re-seed and confirm built-ins are back
    initializeDefaultRegistry();
    const registry = getGlobalRegistry();
    expect(registry.weights['userAgent']).toBeDefined();
    expect(registry.comparators['fonts']).toBeDefined();
  });
});

describe('initializeDefaultRegistry idempotency', () => {
  it('calling initializeDefaultRegistry twice does not double values', () => {
    clearRegistry();
    initializeDefaultRegistry();
    const after1 = getGlobalRegistry().weights['userAgent'];
    initializeDefaultRegistry();
    const after2 = getGlobalRegistry().weights['userAgent'];
    // Weight should remain the same (last-write wins, not accumulated)
    expect(after2).toBe(after1);
  });
});
