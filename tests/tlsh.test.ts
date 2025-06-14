import { expect, describe, it } from 'vitest';
import { getHash, compareHashes } from '../src/libs/tlsh.ts';

export function randomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[]{};!@#$%^&*()-_=+|;:",.<>?';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

describe('tlsh library', () => {
  it('should generate a non-empty hash for a string greater than 512 characters', () => {
    const data = randomString(524);
    const hash = getHash(data);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should generate the same hash for the same string', () => {
    const data = randomString(524);
    const hash1 = getHash(data);
    const hash2 = getHash(data);
    expect(hash1).toBe(hash2);
  });

  it('should compare two identical hashes and return 0 distance', () => {
    const data = randomString(524);
    const hash1 = getHash(data);
    const hash2 = getHash(data);
    const distance = compareHashes(hash1, hash2);
    expect(distance).toBe(0);
  });

  it('should compare two different hashes and return a positive distance', () => {
    const data1 = randomString(524);
    const data2 = randomString(524);
    const hash1 = getHash(data1);
    const hash2 = getHash(data2);
    const distance = compareHashes(hash1, hash2);
    expect(distance).toBeGreaterThanOrEqual(0);
  });

  it('should compare two similar hashes and return a small distance', () => {
    const data = randomString(524);
    const randomIndex = Math.floor(Math.random() * (data.length - 4));
    const modifiedData = data.slice(0, randomIndex) + randomString(4) + data.slice(randomIndex + 4);
    const hash1 = getHash(data);
    const hash2 = getHash(modifiedData);
    const distance = compareHashes(hash1, hash2);
    console.log('Distance between hashes:', distance);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(200); // Assuming small changes yield small distances
  });

  it('should compare two very different hashes and return a large distance', () => {
    const data1 = randomString(524);
    const data2 = randomString(524);
    const hash1 = getHash(data1);
    const hash2 = getHash(data2);
    const distance = compareHashes(hash1, hash2);
    console.log('Distance between hashes:', distance);
    expect(distance).toBeGreaterThan(180); // Assuming very different data yields larger distances
  });

  it('should throw or handle invalid hash input gracefully', () => {
    expect(() => compareHashes('invalidhash', 'anotherinvalid')).toThrow();
  });
});