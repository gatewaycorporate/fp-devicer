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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisAdapter = createRedisAdapter;
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = require("crypto");
const confidence_1 = require("../../libs/confidence");
function createRedisAdapter(redisUrl) {
    const redis = new ioredis_1.default(redisUrl || "redis://localhost:6379");
    return {
        init() {
            return __awaiter(this, void 0, void 0, function* () { });
        },
        save(snapshot) {
            return __awaiter(this, void 0, void 0, function* () {
                const key = `fp:device:${snapshot.deviceId}`;
                const snapshotId = (0, crypto_1.randomUUID)();
                yield redis
                    .multi()
                    .hset(key, snapshotId, JSON.stringify(snapshot))
                    .expire(key, 60 * 60 * 24 * 90) // 90-day TTL
                    .exec();
                return snapshotId;
            });
        },
        getHistory(deviceId_1) {
            return __awaiter(this, arguments, void 0, function* (deviceId, limit = 50) {
                const key = `fp:device:${deviceId}`;
                const raw = yield redis.hvals(key);
                return raw.slice(0, limit).map((v) => JSON.parse(v));
            });
        },
        findCandidates(query_1, minConfidence_1) {
            return __awaiter(this, arguments, void 0, function* (query, minConfidence, limit = 20) {
                const allKeys = yield redis.keys("fp:device:*");
                const candidates = [];
                for (const key of allKeys) {
                    const snapshots = yield redis.hvals(key);
                    for (const snapshot of snapshots) {
                        const parsed = JSON.parse(snapshot);
                        const confidence = (0, confidence_1.calculateConfidence)(query, parsed);
                        if (confidence >= minConfidence) {
                            candidates.push(Object.assign(Object.assign({}, parsed), { confidence }));
                        }
                    }
                }
                candidates.sort((a, b) => b.confidence - a.confidence);
                return candidates.slice(0, limit);
            });
        },
        linkToUser(deviceId, userId) {
            return __awaiter(this, void 0, void 0, function* () {
                yield redis.hset(`fp:device:${deviceId}`, "userId", userId);
            });
        },
        deleteOldSnapshots(olderThanDays) {
            return __awaiter(this, void 0, void 0, function* () {
                // This is a no-op since we set TTL on keys, but you could also implement a scan + delete here if needed
                return 0;
            });
        },
        close() {
            return __awaiter(this, void 0, void 0, function* () { yield redis.quit(); });
        }
    };
}
