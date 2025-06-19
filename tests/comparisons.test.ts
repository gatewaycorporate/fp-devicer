import { describe, it, expect } from 'vitest';
import { compareArrays, compareDatasets } from '../src/libs/confidence';

describe('Array Comparison', () => {
  it('should compare two identical arrays', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 3];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([3, 3]); // 3 fields, 3 matches
  });

  it('should compare two different arrays', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [3, 1, 4];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([3, 0]); // 3 fields, 0 matches
  });

  it('should handle nested arrays', () => {
    const arr1 = [1, [2, 3], 4];
    const arr2 = [1, [2, 3], 5];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([4, 3]); // 4 fields, 3 matches
  });

  it('should handle empty arrays', () => {
    const arr1: any[] = [];
    const arr2: any[] = [];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([0, 0]); // 0 fields, 0 matches
  });

  it('should handle arrays with different lengths', () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([2, 2]); // 2 fields, 2 matches
  });

  it('should handle arrays with undefined values', () => {
    const arr1 = [1, undefined, 3];
    const arr2 = [1, 2, 3];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it('should handle nested empty arrays', () => {
    const arr1 = [1, [], [[], []], 3];
    const arr2 = [1, [2], [[], []], 3];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it('should handle arrays of objects', () => {
    const arr1 = [{ a: 1 }, { b: 2 }];
    const arr2 = [{ a: 1 }, { b: 3 }];
    const result = compareArrays(arr1, arr2);
    expect(result).toEqual([2, 1]); // 2 fields, 1 matches
  })

  it('should throw an error for max depth exceeded', () => {
    const arr1 = [1, [2, [3, [4, [5, [6]]]]]];
    const arr2 = [1, [2, [3, [4, [5, [6]]]]]];
    expect(() => compareArrays(arr1, arr2, 0)).toThrow('Max depth exceeded');
  });
});