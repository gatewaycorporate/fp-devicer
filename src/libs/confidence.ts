import { getHash, compareHashes } from "./tlsh";
import { FPDataSet } from "../types/data";

function compareDataSets(data1: FPDataSet, data2: FPDataSet): [number, number] {
  let fields = 0;
  let matches = 0;
  for (const key in data1) {
    if (data1[key] !== undefined && data2[key] !== undefined) {
      fields++;
      if (typeof data1[key] == "object") {
        const subData = compareDataSets(data1[key] as FPDataSet, data2[key] as FPDataSet);
        fields += subData[0] - 1; // Subtract 1 for the key itself
        matches += subData[1];
      }
      if (data1[key] == data2[key]) {
        matches++;
      }
    }
  }
  return [fields, matches];
}

export function calculateConfidence(data1: FPDataSet, data2: FPDataSet): number {
  // Calculate the hash for each user data
  const hash1 = getHash(JSON.stringify(data1));
  const hash2 = getHash(JSON.stringify(data2));

  // Compare the hashes to get their difference
  const differenceScore = compareHashes(hash1, hash2);

  // Compare how many fields are the same in both datasets
  const [fields, matches] = compareDataSets(data1, data2);

  const inverseMatchScore = 1 - (matches / fields);
  const x = (differenceScore / 1.5) * inverseMatchScore
  if (inverseMatchScore === 0 || differenceScore === 0) {
    return 100;
  }
  return 100 / (1 + Math.E ** (-4.5 + (0.25 * x)));
}