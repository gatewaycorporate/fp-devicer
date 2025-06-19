import { it, describe, expect } from 'vitest';
import { FPUserDataSet } from '../src/types/data';
import { calculateConfidence } from '../src/libs/confidence';
import { randomString } from './tlsh.test';

const sampleData1: FPUserDataSet = {
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
  canvasHash: randomString(524),
  audioHash: randomString(524),
  webglHash: randomString(524)
};

const sampleData2: FPUserDataSet = {
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
  canvasHash: randomString(524),
  audioHash: randomString(524),
  webglHash: randomString(524)
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
    const similarData: FPUserDataSet = {
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
    const partialData: FPUserDataSet = {
      ...sampleData1,
      hardware: {
        cpu: 'Pentium 4',
        gpu: 'Intel HD Graphics',
        ram: 4096
      },
      timezone: 'Europe/London',
      ip: '178.238.11.6'
    };
    const confidence = calculateConfidence(sampleData1, partialData);
    console.log('Confidence for partially similar data:', confidence);
    expect(confidence).toBeGreaterThan(10);
    expect(confidence).toBeLessThan(95);
  });

  it('should handle empty datasets and nonetypes gracefully', () => {
    const incompleteData = {
      ...sampleData1,
      hardware: {},
      screen: null
    };
    const confidence = calculateConfidence(sampleData1, incompleteData);
    expect(confidence).toBeGreaterThan(0); // Expecting some confidence even with missing data
    expect(confidence).toBeLessThan(100); // Not identical, so confidence should not be 100
  });
});