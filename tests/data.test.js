"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const tlsh_ts_1 = require("../src/libs/tlsh.ts");
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
(0, vitest_1.describe)('User Data Fingerprinting', () => {
    (0, vitest_1.it)('should generate a hash for user data', () => {
        const hash = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        (0, vitest_1.expect)(typeof hash).toBe('string');
        (0, vitest_1.expect)(hash.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should generate the same hash for identical user data', () => {
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        (0, vitest_1.expect)(hash1).toBe(hash2);
    });
    (0, vitest_1.it)('should generate different hashes for different user data', () => {
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData2));
        (0, vitest_1.expect)(hash1).not.toBe(hash2);
    });
    (0, vitest_1.it)('should compare hashes of identical user data and return 0 distance', () => {
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const distance = (0, tlsh_ts_1.compareHashes)(hash1, hash2);
        (0, vitest_1.expect)(distance).toBe(0);
    });
    (0, vitest_1.it)('should compare hashes of different user data and return a positive distance', () => {
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData2));
        const distance = (0, tlsh_ts_1.compareHashes)(hash1, hash2);
        console.log('Distance between hashes:', distance);
        (0, vitest_1.expect)(distance).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should compare similar user data and return a small distance', () => {
        const modifiedData = Object.assign(Object.assign({}, sampleData1), { hardware: Object.assign(Object.assign({}, sampleData1.hardware), { ram: 8192 }) }); // Slightly modified
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(modifiedData));
        const distance = (0, tlsh_ts_1.compareHashes)(hash1, hash2);
        console.log('Distance between hashes:', distance);
        (0, vitest_1.expect)(distance).toBeGreaterThan(0);
        (0, vitest_1.expect)(distance).toBeLessThan(140); // Assuming small changes yield small distances
    });
    (0, vitest_1.it)('should compare very different user data and return a large distance', () => {
        const hash1 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData1));
        const hash2 = (0, tlsh_ts_1.getHash)(JSON.stringify(sampleData2));
        const distance = (0, tlsh_ts_1.compareHashes)(hash1, hash2);
        console.log('Distance between hashes:', distance);
        (0, vitest_1.expect)(distance).toBeGreaterThan(80); // Assuming significant differences yield larger distances
    });
    (0, vitest_1.it)('should handle invalid hash input gracefully', () => {
        (0, vitest_1.expect)(() => (0, tlsh_ts_1.compareHashes)('invalidhash', 'anotherinvalid')).toThrow();
    });
});
// This test suite verifies the functionality of user data fingerprinting using the TLSH hashing algorithm.
