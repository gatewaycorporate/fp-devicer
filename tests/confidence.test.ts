import { it, describe, expect } from 'vitest';
import { UserData } from '../src/libs/data';
import { getHash } from '../src/libs/tlsh';
import { calculateConfidence } from '../src/libs/confidence';
import { randomString } from './tlsh.test';

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

describe('Confidence Calculation', () => {
  it('should calculate confidence between two user data objects', () => {
    const confidence = calculateConfidence(sampleData1, sampleData2);
    console.log('Confidence:', confidence);
    expect(typeof confidence).toBe('number');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
  });

  it('should return 100% confidence for identical user data', () => {
    const confidence = calculateConfidence(sampleData1, sampleData1);
    expect(confidence).toBe(100);
  });

  it('should return high confidence for similar user data', () => {
    const similarData: UserData = {
      ...sampleData1,
      hardware: {
        ...sampleData1.hardware,
        ram: 8192 // Slightly different RAM
      }
    };
    const confidence = calculateConfidence(sampleData1, similarData);
    console.log('Confidence for similar data:', confidence);
    expect(confidence).toBeGreaterThan(80);
  });

  it('should return lower confidence for different user data', () => {
    const confidence = calculateConfidence(sampleData1, sampleData2);
    console.log('Confidence for different data:', confidence);
    expect(confidence).toBeLessThan(10);
  });

  it('should return middling confidence for partially similar data', () => {
    const partialData: UserData = {
      ...sampleData1,
      hardware: {
        ...sampleData1.hardware,
        gpu: 'Intel HD Graphics' // Different GPU
      },
      screen: {
        ...sampleData1.screen,
        width: 1280, // Different screen width
        height: 720 // Different screen height
      },
      timezone: 'Europe/London', // Different timezone
    };
    const confidence = calculateConfidence(sampleData1, partialData);
    console.log('Confidence for partially similar data:', confidence);
    expect(confidence).toBeGreaterThan(10);
    expect(confidence).toBeLessThan(95);
  });
});