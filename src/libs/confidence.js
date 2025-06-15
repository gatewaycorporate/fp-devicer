"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidence = void 0;
const tlsh_1 = require("./tlsh");
function compareDataSets(data1, data2) {
    let fields = 0;
    let matches = 0;
    for (const key in data1) {
        if (data1[key] !== undefined && data2[key] !== undefined) {
            fields++;
            if (typeof data1[key] == "object") {
                const subData = compareDataSets(data1[key], data2[key]);
                fields += subData[0];
                matches += subData[1];
            }
            if (data1[key] == data2[key]) {
                matches++;
            }
        }
    }
    return [fields, matches];
}
function calculateConfidence(data1, data2) {
    // Calculate the hash for each user data
    const hash1 = (0, tlsh_1.getHash)(JSON.stringify(data1));
    const hash2 = (0, tlsh_1.getHash)(JSON.stringify(data2));
    // Compare the hashes to get their difference
    const differenceScore = (0, tlsh_1.compareHashes)(hash1, hash2);
    // Compare how many fields are the same in both datasets
    const [fields, matches] = compareDataSets(data1, data2);
    const inverseMatchScore = 1 - (matches / fields);
    const x = (differenceScore / 1.5) * inverseMatchScore;
    if (inverseMatchScore === 0 || differenceScore === 0) {
        return 100;
    }
    return 100 / (1 + Math.E ** (-4.5 + (0.25 * x)));
}
exports.calculateConfidence = calculateConfidence;
