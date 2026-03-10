import { describe, it, expect } from 'vitest';
import { AdapterFactory } from '../../core/AdapterFactory';

describe('AdapterFactory.create', () => {
  describe('in-memory', () => {
    it('returns a valid StorageAdapter without any options', () => {
      const adapter = AdapterFactory.create('in-memory');
      expect(adapter).toBeDefined();
      expect(typeof adapter.init).toBe('function');
      expect(typeof adapter.save).toBe('function');
      expect(typeof adapter.getHistory).toBe('function');
      expect(typeof adapter.findCandidates).toBe('function');
      expect(typeof adapter.linkToUser).toBe('function');
      expect(typeof adapter.deleteOldSnapshots).toBe('function');
      expect(typeof adapter.getAllFingerprints).toBe('function');
    });

    it('init() resolves without throwing', async () => {
      const adapter = AdapterFactory.create('in-memory');
      await expect(adapter.init()).resolves.not.toThrow();
    });
  });

  describe('sqlite', () => {
    it('throws a descriptive error when sqlite.filePath is missing', () => {
      expect(() => AdapterFactory.create('sqlite', {})).toThrow(/filePath/i);
    });

    it('throws when filePath is explicitly undefined', () => {
      expect(() => AdapterFactory.create('sqlite', { sqlite: { filePath: '' } })).toThrow();
    });

    it('returns an adapter when a valid filePath is supplied', () => {
      const adapter = AdapterFactory.create('sqlite', { sqlite: { filePath: ':memory:' } });
      expect(adapter).toBeDefined();
      expect(typeof adapter.init).toBe('function');
    });
  });

  describe('postgres', () => {
    it('throws a descriptive error when postgres.connectionString is missing', () => {
      expect(() => AdapterFactory.create('postgres', {})).toThrow(/connectionString/i);
    });

    it('returns an adapter when a connectionString is supplied', () => {
      const adapter = AdapterFactory.create('postgres', {
        postgres: { connectionString: 'postgresql://user:pass@localhost/db' },
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.init).toBe('function');
    });
  });

  describe('redis', () => {
    it('throws a descriptive error when redis.url is missing', () => {
      expect(() => AdapterFactory.create('redis', {})).toThrow(/url/i);
    });

    it('returns an adapter when a url is supplied', () => {
      const adapter = AdapterFactory.create('redis', {
        redis: { url: 'redis://localhost:6379' },
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.init).toBe('function');
    });
  });

  describe('unknown type', () => {
    it('throws for an unsupported adapter type', () => {
      expect(() => AdapterFactory.create('unsupported' as any)).toThrow(/unsupported/i);
    });

    it('error message includes the unknown type string', () => {
      try {
        AdapterFactory.create('foobar' as any);
      } catch (err: any) {
        expect(err.message).toMatch(/foobar/i);
      }
    });
  });
});
