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
exports.DeviceManager = void 0;
const confidence_1 = require("../libs/confidence");
const crypto_1 = require("crypto");
class DeviceManager {
    constructor(adapter) {
        this.adapter = adapter;
    }
    identify(incoming, context) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            // 1. Quick pre-filter (screen, hardwareConcurrency, etc.) → candidates
            const candidates = yield this.adapter.findCandidates(incoming, 60, 50);
            // 2. Full scoring
            let bestMatch = null;
            for (const cand of candidates) {
                const history = yield this.adapter.getHistory(cand.deviceId, 1);
                if (!history.length)
                    continue;
                const score = (0, confidence_1.calculateConfidence)(incoming, history[0].fingerprint);
                if (score > ((_a = bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.confidence) !== null && _a !== void 0 ? _a : 0)) {
                    bestMatch = Object.assign(Object.assign({}, cand), { confidence: score });
                }
            }
            const deviceId = bestMatch && bestMatch.confidence > 80
                ? bestMatch.deviceId
                : `dev_${(0, crypto_1.randomUUID)()}`;
            // 3. Save new snapshot
            yield this.adapter.save({
                id: (0, crypto_1.randomUUID)(),
                deviceId,
                userId: context === null || context === void 0 ? void 0 : context.userId,
                timestamp: new Date(),
                fingerprint: incoming,
                ip: context === null || context === void 0 ? void 0 : context.ip,
            });
            return {
                deviceId,
                confidence: (_b = bestMatch === null || bestMatch === void 0 ? void 0 : bestMatch.confidence) !== null && _b !== void 0 ? _b : 0,
                isNewDevice: !bestMatch,
                linkedUserId: context === null || context === void 0 ? void 0 : context.userId,
            };
        });
    }
}
exports.DeviceManager = DeviceManager;
