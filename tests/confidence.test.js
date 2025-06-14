"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tlsh_ts_1 = require("../src/libs/tlsh.ts");
const confidence_ts_1 = require("../src/libs/confidence.ts");
const tlsh_test_ts_1 = require("./tlsh.test.ts");
const sampleData1 = {
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
    canvasHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524)),
    audioHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524)),
    webglHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524))
};
const sampleData2 = {
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
    canvasHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524)),
    audioHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524)),
    webglHash: (0, tlsh_ts_1.getHash)((0, tlsh_test_ts_1.randomString)(524))
};
(0, vitest_1.describe)('Confidence Calculation', () => {
    (0, vitest_1.it)('should calculate confidence between two user data objects', () => {
        const confidence = (0, confidence_ts_1.calculateConfidence)(sampleData1, sampleData2);
        console.log('Confidence:', confidence);
        (0, vitest_1.expect)(typeof confidence).toBe('number');
        (0, vitest_1.expect)(confidence).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(confidence).toBeLessThanOrEqual(100);
    });
    (0, vitest_1.it)('should return 100% confidence for identical user data', () => {
        const confidence = (0, confidence_ts_1.calculateConfidence)(sampleData1, sampleData1);
        (0, vitest_1.expect)(confidence).toBe(100);
    });
    (0, vitest_1.it)('should return high confidence for similar user data', () => {
        const similarData = Object.assign(Object.assign({}, sampleData1), { hardware: Object.assign(Object.assign({}, sampleData1.hardware), { ram: 8192 // Slightly different RAM
             }) });
        const confidence = (0, confidence_ts_1.calculateConfidence)(sampleData1, similarData);
        console.log('Confidence for similar data:', confidence);
        (0, vitest_1.expect)(confidence).toBeGreaterThan(80);
    });
    (0, vitest_1.it)('should return lower confidence for different user data', () => {
        const confidence = (0, confidence_ts_1.calculateConfidence)(sampleData1, sampleData2);
        console.log('Confidence for different data:', confidence);
        (0, vitest_1.expect)(confidence).toBeLessThan(10);
    });
    (0, vitest_1.it)('should return middling confidence for partially similar data', () => {
        const partialData = Object.assign(Object.assign({}, sampleData1), { hardware: Object.assign(Object.assign({}, sampleData1.hardware), { gpu: 'Intel HD Graphics' // Different GPU
             }), screen: Object.assign(Object.assign({}, sampleData1.screen), { width: 1280, height: 720 // Different screen height
             }), timezone: 'Europe/London' });
        const confidence = (0, confidence_ts_1.calculateConfidence)(sampleData1, partialData);
        console.log('Confidence for partially similar data:', confidence);
        (0, vitest_1.expect)(confidence).toBeGreaterThan(10);
        (0, vitest_1.expect)(confidence).toBeLessThan(95);
    });
});
