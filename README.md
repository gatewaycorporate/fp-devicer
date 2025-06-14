# FP-Devicer
## Developed by Gateway Corporate Solutions LLC

FP-Devicer is a digital fingerprinting middleware library designed for ease of use and near-universal compatibility with servers.

Importing and using the library to compare fingerprints between users is as simple as collecting some user data and running the calculateConfidence function.
```javascript
import { UserData, calculateConfidence } from "fp-devicer";

const user1: UserData = {
  // Collected data goes here
}

const user2: UserData = {
  // Collected data goes here
}

const confidence = calculateConfidence(user1, user2);
```

The resulting confidence will range between 0 and 100, with 100 providing the highest confidence of the users being identical.