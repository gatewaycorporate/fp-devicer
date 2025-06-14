"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareHashes = exports.getHash = void 0;
const tlsh_1 = __importDefault(require("tlsh"));
const digest_hash_builder_js_1 = __importDefault(require("tlsh/lib/digests/digest-hash-builder.js"));
function getHash(data) {
    // Convert the input data to a string if it's not already
    const inputString = typeof data === 'string' ? data : JSON.stringify(data);
    // Generate the TLSH hash
    const tlshHash = (0, tlsh_1.default)(inputString);
    // Return the hash as a string
    return tlshHash;
}
exports.getHash = getHash;
function compareHashes(hash1, hash2) {
    const digest1 = (0, digest_hash_builder_js_1.default)().withHash(hash1).build();
    const digest2 = (0, digest_hash_builder_js_1.default)().withHash(hash2).build();
    return digest1.calculateDifference(digest2, true);
}
exports.compareHashes = compareHashes;
