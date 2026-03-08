import express from 'express';
import { DeviceManager, createInMemoryAdapter } from '../main.js';
const manager = new DeviceManager(createInMemoryAdapter());
const app = express();
app.use(express.json());
app.post('/identify', async (req, res) => {
    const result = await manager.identify(req.body, { userId: req.user?.id, ip: req.ip });
    res.json(result); // → { deviceId, confidence, isNewDevice, linkedUserId }
});
app.listen(3000, () => console.log('✅ FP-Devicer server ready on :3000'));
