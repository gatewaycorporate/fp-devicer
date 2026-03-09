import express from 'express';
import { DeviceManager, createInMemoryAdapter } from 'devicer.js';

const manager = new DeviceManager(createInMemoryAdapter());
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
	res.sendFile('src/examples/quickstart.html', { root: process.cwd() });
})

app.get('/bundle.js', (req, res) => {
	res.sendFile('src/examples/bundle.js', { root: process.cwd() });
});

app.post('/identify', async (req, res) => {
  const result = await manager.identify(req.body, { userId: (req as any).user?.id, ip: req.ip });
  res.json(result); // → { deviceId, confidence, isNewDevice, linkedUserId }
});

app.listen(3000, () => console.log('✅ FP-Devicer server ready at http://localhost:3000'));