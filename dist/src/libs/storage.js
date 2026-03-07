"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryAdapter = createInMemoryAdapter;
const confidence_1 = require("./confidence");
function createInMemoryAdapter() {
    const store = new Map();
    return {
        init() {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        save(snapshot) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!store.has(snapshot.deviceId))
                    store.set(snapshot.deviceId, []);
                store.get(snapshot.deviceId).push(snapshot);
                return snapshot.id;
            });
        },
        getHistory(deviceId_1) {
            return __awaiter(this, arguments, void 0, function* (deviceId, limit = 50) {
                return (store.get(deviceId) || []).slice(-limit);
            });
        },
        findCandidates(query_1, minConfidence_1) {
            return __awaiter(this, arguments, void 0, function* (query, minConfidence, limit = 20) {
                const matches = [];
                for (const [deviceId, history] of store) {
                    if (!history.length)
                        continue;
                    const latest = history[history.length - 1];
                    const score = (0, confidence_1.calculateConfidence)(query, latest.fingerprint);
                    if (score >= minConfidence) {
                        matches.push({ deviceId, confidence: score, lastSeen: latest.timestamp });
                    }
                    if (matches.length >= limit)
                        break;
                }
                return matches.sort((a, b) => b.confidence - a.confidence);
            });
        },
        linkToUser() {
            return __awaiter(this, void 0, void 0, function* () {
                // In-memory stub: no-op since we don't have a real DB to update. In production, this would update all snapshots for the deviceId to set userId.
            });
        },
        deleteOldSnapshots() {
            return __awaiter(this, void 0, void 0, function* () { return 0; });
        },
    };
}
// Usage: const adapter = createInMemoryAdapter();
