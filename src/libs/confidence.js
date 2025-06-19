"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateConfidence = exports.compareDatasets = exports.compareArrays = void 0;
const tlsh_1 = require("./tlsh");
function compareArrays(arr1, arr2, max_depth = 5) {
    let fields = 0;
    let matches = 0;
    // Ensure max_depth is not exceeded
    if (max_depth <= 0) {
        throw new Error("Max depth exceeded");
    }
    // Sort arrays to ensure consistent comparison
    const sortedArr1 = arr1.map((item) => JSON.stringify(item)).sort().map((item) => {
        try {
            return JSON.parse(item);
        }
        catch (e) {
            return undefined;
        }
    });
    const sortedArr2 = arr2.map((item) => JSON.stringify(item)).sort().map((item) => {
        try {
            return JSON.parse(item);
        }
        catch (e) {
            return undefined;
        }
    });
    const maxLength = Math.min(arr1.length, arr2.length);
    for (let i = 0; i < maxLength; i++) {
        fields++;
        if (Array.isArray(sortedArr1[i]) && Array.isArray(sortedArr2[i])) {
            const subData = compareArrays(sortedArr1[i], sortedArr2[i], max_depth - 1);
            fields += subData[0] - 1; // Subtract 1 for the index itself
            matches += subData[1];
        }
        else if ((typeof sortedArr1[i] == "object" && sortedArr1[i]) &&
            (typeof sortedArr2[i] == "object" && sortedArr2[i])) {
            const subData = compareDatasets(sortedArr1[i], sortedArr2[i], max_depth - 1);
            fields += subData[0] - 1; // Subtract 1 for the index itself
            matches += subData[1];
        }
        if (arr1[i] === arr2[i]) {
            matches++;
        }
    }
    return [fields, matches];
}
exports.compareArrays = compareArrays;
function compareDatasets(data1, data2, max_depth = 5) {
    let fields = 0;
    let matches = 0;
    // Ensure max_depth is not exceeded
    if (max_depth <= 0) {
        throw new Error("Max depth exceeded");
    }
    for (const key in data1) {
        if (data1[key] !== undefined && data2[key] !== undefined) {
            fields++;
            if ((typeof data1[key] == "object" && data1[key]) &&
                (typeof data2[key] == "object" && data2[key])) {
                const subData = compareDatasets(data1[key], data2[key], max_depth - 1);
                fields += subData[0] - 1; // Subtract 1 for the key itself
                matches += subData[1];
            }
            else if (Array.isArray(data1[key]) && Array.isArray(data2[key])) {
                const subData = compareArrays(data1[key], data2[key], max_depth - 1);
                fields += subData[0] - 1; // Subtract 1 for the key itself
                matches += subData[1];
            }
            else if (data1[key] == data2[key]) {
                matches++;
            }
        }
    }
    return [fields, matches];
}
exports.compareDatasets = compareDatasets;
function calculateConfidence(data1, data2) {
    try {
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
    catch (error) {
        console.error("Error calculating confidence:", error);
        return 0; // Return 0 if an error occurs during comparison
    }
}
exports.calculateConfidence = calculateConfidence;
