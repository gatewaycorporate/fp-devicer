"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidence = void 0;
const tlsh_1 = require("./tlsh");
function compareArrays(arr1, arr2) {
    let fields = 0;
    let matches = 0;
    const maxLength = Math.max(arr1.length, arr2.length);
    for (let i = 0; i < maxLength; i++) {
        if (arr1[i] !== undefined && arr2[i] !== undefined) {
            fields++;
            if (Array.isArray(arr1[i]) && Array.isArray(arr2[i])) {
                const subData = compareArrays(arr1[i], arr2[i]);
                fields += subData[0] - 1; // Subtract 1 for the index itself
                matches += subData[1];
            }
            else if ((typeof arr1[i] == "object" && arr1[i]) &&
                (typeof arr2[i] == "object" && arr2[i])) {
                const subData = compareDatasets(arr1[i], arr2[i]);
                fields += subData[0] - 1; // Subtract 1 for the index itself
                matches += subData[1];
            }
            else if (arr1[i] === arr2[i]) {
                matches++;
            }
        }
    }
    return [fields, matches];
}
function compareDatasets(data1, data2) {
    let fields = 0;
    let matches = 0;
    for (const key in data1) {
        if (data1[key] !== undefined && data2[key] !== undefined) {
            fields++;
            if ((typeof data1[key] == "object" && data1[key]) &&
                (typeof data2[key] == "object" && data2[key])) {
                const subData = compareDatasets(data1[key], data2[key]);
                fields += subData[0] - 1; // Subtract 1 for the key itself
                matches += subData[1];
            }
            else if (Array.isArray(data1[key]) && Array.isArray(data2[key])) {
                const subData = compareArrays(data1[key], data2[key]);
                fields += subData[0] - 1; // Subtract 1 for the key itself
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
    // Compare how many fields are the same in both datasets
    const [fields, matches] = compareDatasets(data1, data2);
    if (fields === 0 || matches === 0) {
        return 0;
    }
    // Calculate the hash for each user data
    const hash1 = (0, tlsh_1.getHash)(JSON.stringify(data1));
    const hash2 = (0, tlsh_1.getHash)(JSON.stringify(data2));
    // Compare the hashes to get their difference
    const differenceScore = (0, tlsh_1.compareHashes)(hash1, hash2);
    const inverseMatchScore = 1 - (matches / fields);
    const x = 1.3 * differenceScore * inverseMatchScore;
    if (inverseMatchScore === 0 || differenceScore === 0) {
        return 100;
    }
    const confidenceScore = 100 / (1 + Math.E ** (-4.5 + (0.3 * x)));
    return confidenceScore;
}
exports.calculateConfidence = calculateConfidence;
