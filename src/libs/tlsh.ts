import hash from 'tlsh';
import DigestHashBuilder from 'tlsh/lib/digests/digest-hash-builder.js';

export function getHash(data: string): string {
  // Convert the input data to a string if it's not already
  const inputString = typeof data === 'string' ? data : JSON.stringify(data);
  
  // Generate the TLSH hash
  const tlshHash = hash(inputString);
  
  // Return the hash as a string
  return tlshHash;
}

export function compareHashes(hash1: string, hash2: string): number {
  const digest1 = DigestHashBuilder().withHash(hash1).build();
  const digest2 = DigestHashBuilder().withHash(hash2).build();
  return digest1.calculateDifference(digest2, true);
}