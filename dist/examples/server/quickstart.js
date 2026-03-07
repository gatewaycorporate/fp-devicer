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
const express_1 = __importDefault(require("express"));
const main_1 = require("../../src/main");
const manager = new main_1.DeviceManager((0, main_1.createInMemoryAdapter)());
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post('/identify', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield manager.identify(req.body, { userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.id, ip: req.ip });
    res.json(result); // → { deviceId, confidence, isNewDevice, linkedUserId }
}));
app.listen(3000, () => console.log('✅ FP-Devicer server ready on :3000'));
