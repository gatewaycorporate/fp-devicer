# FP-Devicer
## Developed by Gateway Corporate Solutions LLC

FP-Devicer is a digital fingerprinting middleware library designed for ease of use and near-universal compatibility with servers.

Importing and using the library to compare fingerprints between users is as simple as collecting some user data and running the calculateConfidence function.
```javascript
import { calculateConfidence, createConfidenceCalculator } from "devicer.js";

// 1. Simple Method
const score = calculateConfidence(fpData1, fpData2);

// 2. Advanced Method (Custom weights & comparitors)
const myCalculator = createConfidenceCalculator({
  weights: {
    userAgent: 20,
    fonts: 10
  },
  comparators: {
    userAgent: (a, b) => levenshteinSimilarity(String(a).toLowerCase(), String(b).toLowerCase())
  },
  tlshWeight: 0.25,
});

const advancedScore = myCalculator.calculateConfidence(fpData1, fpData2);
```

The resulting confidence will range between 0 and 100, with 100 providing the highest confidence of the users being identical.