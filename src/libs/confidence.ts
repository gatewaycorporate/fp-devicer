import { getHash, compareHashes } from "./tlsh";

interface IndexableUserData {
  [key: string]: any;
}

export function calculateConfidence(data1: IndexableUserData, data2: IndexableUserData): number {
  // Calculate the hash for each user data
  const hash1 = getHash(JSON.stringify(data1));
  const hash2 = getHash(JSON.stringify(data2));

  // Compare the hashes to get their difference
  const differenceScore = compareHashes(hash1, hash2);

  // Compare how many fields are the same in both datasets
  let fields = 0;
  let matches = 0;
  for (const key in data1) {
    if (data1[key] !== undefined && data2[key] !== undefined) {
      fields++;
      if (data1[key] == data2[key]) {
        matches++;
      }
    }
  }

  const inverseMatchScore = 1 - (matches / fields);
  const x = (differenceScore / 1.5) * inverseMatchScore
  if (inverseMatchScore === 0 || differenceScore === 0) {
    return 100;
  }
  return 100 / (1 + Math.E ** (-4.5 + (0.25 * x)));
}