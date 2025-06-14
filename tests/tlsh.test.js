"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomString = void 0;
const vitest_1 = require("vitest");
const tlsh_1 = require("../src/libs/tlsh");
function randomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789[]{};!@#$%^&*()-_=+|;:",.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
exports.randomString = randomString;
(0, vitest_1.describe)('tlsh library', () => {
    (0, vitest_1.it)('should generate a non-empty hash for a string greater than 512 characters', () => {
        const data = randomString(524);
        const hash = (0, tlsh_1.getHash)(data);
        (0, vitest_1.expect)(typeof hash).toBe('string');
        (0, vitest_1.expect)(hash.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('should generate the same hash for the same string', () => {
        const data = randomString(524);
        const hash1 = (0, tlsh_1.getHash)(data);
        const hash2 = (0, tlsh_1.getHash)(data);
        (0, vitest_1.expect)(hash1).toBe(hash2);
    });
    (0, vitest_1.it)('should compare two identical hashes and return 0 distance', () => {
        const data = randomString(524);
        const hash1 = (0, tlsh_1.getHash)(data);
        const hash2 = (0, tlsh_1.getHash)(data);
        const distance = (0, tlsh_1.compareHashes)(hash1, hash2);
        (0, vitest_1.expect)(distance).toBe(0);
    });
    (0, vitest_1.it)('should compare two different hashes and return a positive distance', () => {
        const data1 = randomString(524);
        const data2 = randomString(524);
        const hash1 = (0, tlsh_1.getHash)(data1);
        const hash2 = (0, tlsh_1.getHash)(data2);
        const distance = (0, tlsh_1.compareHashes)(hash1, hash2);
        (0, vitest_1.expect)(distance).toBeGreaterThanOrEqual(0);
    });
    (0, vitest_1.it)('should compare two similar hashes and return a small distance', () => {
        const data = randomString(524);
        const randomIndex = Math.floor(Math.random() * (data.length - 4));
        const modifiedData = data.slice(0, randomIndex) + randomString(4) + data.slice(randomIndex + 4);
        const hash1 = (0, tlsh_1.getHash)(data);
        const hash2 = (0, tlsh_1.getHash)(modifiedData);
        const distance = (0, tlsh_1.compareHashes)(hash1, hash2);
        console.log('Distance between hashes:', distance);
        (0, vitest_1.expect)(distance).toBeGreaterThan(0);
        (0, vitest_1.expect)(distance).toBeLessThan(200); // Assuming small changes yield small distances
    });
    (0, vitest_1.it)('should compare two very different hashes and return a large distance', () => {
        const data1 = randomString(524);
        const data2 = randomString(524);
        const hash1 = (0, tlsh_1.getHash)(data1);
        const hash2 = (0, tlsh_1.getHash)(data2);
        const distance = (0, tlsh_1.compareHashes)(hash1, hash2);
        console.log('Distance between hashes:', distance);
        (0, vitest_1.expect)(distance).toBeGreaterThan(180); // Assuming very different data yields larger distances
    });
    (0, vitest_1.it)('should throw or handle invalid hash input gracefully', () => {
        (0, vitest_1.expect)(() => (0, tlsh_1.compareHashes)('invalidhash', 'anotherinvalid')).toThrow();
    });
});
