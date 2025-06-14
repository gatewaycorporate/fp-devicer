import { it, describe, expect } from 'vitest';
import { UserData } from '../src/libs/data.ts';
import { getHash, compareHashes } from '../src/libs/tlsh.ts';
import { randomString } from './tlsh.test.ts';

const sampleData1: UserData = {
  fonts: ['Arial', 'Verdana'],
  hardware: {
    cpu: 'Intel Core i7',
    gpu: 'NVIDIA GTX 1080',
    ram: 16384 // in MB
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  screen: {
    width: 1920,
    height: 1080,
    colorDepth: 24
  },
  timezone: 'America/New_York',
  ip: '157.185.170.244',
  languages: ['en-US', 'en'],
  plugins: ['Chrome PDF Viewer', 'Shockwave Flash'],
  canvasHash: getHash(randomString(524)),
  audioHash: getHash(randomString(524)),
  webglHash: getHash(randomString(524))
};

const sampleData2: UserData = {
  fonts: ['Arial', 'Verdana'],
  hardware: {
    cpu: 'Pentium 4',
    gpu: 'Intel HD Graphics',
    ram: 4096 // in MB
  },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
  screen: {
    width: 1280,
    height: 720,
    colorDepth: 24
  },
  timezone: 'Europe/London',
  ip: '178.238.11.6',
  languages: ['en-GB', 'en'],
  plugins: ['Chrome PDF Viewer', 'Shockwave Flash'],
  canvasHash: getHash(randomString(524)),
  audioHash: getHash(randomString(524)),
  webglHash: getHash(randomString(524))
};

describe('User Data Fingerprinting', () => {
  it('should generate a hash for user data', () => {
    const hash = getHash(JSON.stringify(sampleData1));
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('should generate the same hash for identical user data', () => {
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(sampleData1));
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different user data', () => {
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(sampleData2));
    expect(hash1).not.toBe(hash2);
  });

  it('should compare hashes of identical user data and return 0 distance', () => {
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(sampleData1));
    const distance = compareHashes(hash1, hash2);
    expect(distance).toBe(0);
  });

  it('should compare hashes of different user data and return a positive distance', () => {
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(sampleData2));
    const distance = compareHashes(hash1, hash2);
    console.log('Distance between hashes:', distance);
    expect(distance).toBeGreaterThan(0);
  });

  it('should compare similar user data and return a small distance', () => {
    const modifiedData = { ...sampleData1, hardware: { ...sampleData1.hardware, ram: 8192 } }; // Slightly modified
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(modifiedData));
    const distance = compareHashes(hash1, hash2);
    console.log('Distance between hashes:', distance);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(140); // Assuming small changes yield small distances
  });

  it('should compare very different user data and return a large distance', () => {
    const hash1 = getHash(JSON.stringify(sampleData1));
    const hash2 = getHash(JSON.stringify(sampleData2));
    const distance = compareHashes(hash1, hash2);
    console.log('Distance between hashes:', distance);
    expect(distance).toBeGreaterThan(80); // Assuming significant differences yield larger distances
  });

  it('should handle invalid hash input gracefully', () => {
    expect(() => compareHashes('invalidhash', 'anotherinvalid')).toThrow();
  });
});
// This test suite verifies the functionality of user data fingerprinting using the TLSH hashing algorithm.