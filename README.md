# FP-Devicer

FP-Devicer is a digital fingerprinting middleware library designed for ease of
use and near-universal compatibility with servers. Developed by [Gateway Corporate Solutions](https://gatewaycorporate.org).

## Usage

Importing and using the library to compare fingerprints between users is as
simple as collecting some user data and running the calculateConfidence
function.

```javascript
// 1. Simple Method (Using defaults)
import { calculateConfidence } from "devicer.js";

const score = calculateConfidence(fpData1, fpData2);

// 2. Advanced Method (Custom weights & comparitors)
import { createConfidenceCalculator, registerPlugin } from "devicer.js";

registerPlugin("userAgent", {
  weight: 25,
  comparator: (a, b) => levenshteinSimilarity(String(a || "").toLowerCase(), String(b || "").toLowerCase())
});

const advancedCalculator = createConfidenceCalculator({
  weights: {
    platform: 20,
    fonts: 20,
    screen: 15
  }
})

const advancedScore = advancedCalculator.calculateConfidence(fpData1, fpData2);

// 3. Enterprise usage (DeviceManager)
import express from 'express';
import { DeviceManager, createInMemoryAdapter } from 'devicer.js';

const manager = new DeviceManager(createInMemoryAdapter());
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
	res.sendFile('public/index.html', { root: process.cwd() });
});

app.post('/identify', async (req, res) => {
  const result = await manager.identify(req.body, { userId: (req as any).user?.id, ip: req.ip });
  res.json(result); // → { deviceId, confidence, isNewDevice, linkedUserId }
});

app.listen(3000, () => console.log('✅ FP-Devicer server ready at http://localhost:3000'));
```

The resulting confidence will range between 0 and 100, with 100 providing the
highest confidence of the users being identical.

## Installation

You can install FP-Devicer with

```bash
npm install devicer.js
```

You can also install the meta-package for the entire Devicer Intelligence Suite
with

```bash
npm install @gatewaycorporate/devicer-intel
```

## Quickstart

To run the quickstart example:

```sh
npm install express devicer.js
npx tsx src/examples/quickstart.ts
```

## Demo

There is a public demo of FP-Devicer (FP-Cicis Command and Control) available
for viewing at [cicis.info](https://cicis.info/).

## Documentation

This project uses typedoc and autodeploys via GitHub Pages. You can view the
generated documentation [here](https://gatewaycorporate.github.io/fp-devicer/).

## Plugin Architecture

`DeviceManager` supports a universal plugin system via `use()`. Any object
implementing `DeviceManagerPlugin` (with a `registerWith(deviceManager)` method)
can extend `identify()` results with additional signals.

```typescript
import { createSqliteAdapter, DeviceManager } from "devicer.js";
import { IpManager } from "ip-devicer";
import { TlsManager } from "tls-devicer";

const manager = new DeviceManager(createSqliteAdapter("./db.sqlite"));

manager.use(new IpManager({ licenseKey: process.env.DEVICER_LICENSE_KEY }));
manager.use(new TlsManager({ licenseKey: process.env.DEVICER_LICENSE_KEY }));

// result now includes ipEnrichment, tlsConsistency, etc.
const result = await manager.identify(fp, {
	ip: req.ip,
	tlsProfile: req.tlsProfile,
});

// Optionally unregister a plugin later:
const unregister = manager.use(myPlugin);
unregister();
```

Custom plugins implement `DeviceManagerPlugin` from `devicer.js`. See the
[documentation](https://gatewaycorporate.github.io/fp-devicer/) for the full
interface reference.

## Benchmarks

When calibrated correctly, FP-Devicer is over 99% accurate and gets more
accurate as it analyzes fingerprints. The average time to calculate the
difference between two fingerprints is less than 1ms. To view/run the benchmarks
on your machine:

```sh
npm run bench
```

## Whitepaper

The whitepaper covers the theory, architecture, and design decisions behind
FP-Devicer. You can read it
[here](https://gatewaycorporate.org/papers/FP-Devicer.pdf).
