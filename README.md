# FP-Devicer
## Developed by Gateway Corporate Solutions LLC

FP-Devicer is a digital fingerprinting middleware library designed for ease of use and near-universal compatibility with servers.

Importing and using the library to compare fingerprints between users is as simple as collecting some user data and running the calculateConfidence function.
```javascript
import { calculateConfidence, createConfidenceCalculator, registerPlugin } from "devicer.js";

// 1. Simple Method (Using defaults)
const score = calculateConfidence(fpData1, fpData2);

// 2. Advanced Method (Custom weights & comparitors)
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
```

The resulting confidence will range between 0 and 100, with 100 providing the highest confidence of the users being identical.