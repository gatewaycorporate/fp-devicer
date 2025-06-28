import { describe, expect, it } from "vitest";
import { compareArrays } from "../src/libs/confidence";

describe("Array Comparison", () => {
  it("should compare two identical arrays", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2, 3];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 3]); // 3 fields, 3 matches
  });

  it("should compare two different arrays", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [6, 5, 4];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 0]); // 3 fields, 0 matches
  });

  it("should handle shuffled arrays with the same elements", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [3, 2, 1];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 3]); // 3 fields, 3 matches
  });

  it("should handle nested arrays", () => {
    const arr1 = [1, [2, 3], 4];
    const arr2 = [1, [2, 3], 5];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([4, 3]); // 4 fields, 3 matches
  });

  it("should handle empty arrays", () => {
    const arr1: any[] = [];
    const arr2: any[] = [];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([0, 0]); // 0 fields, 0 matches
  });

  it("should handle arrays with different lengths", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [1, 2];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([2, 2]); // 2 fields, 2 matches
  });

  it("should handle arrays with undefined values", () => {
    const arr1 = [1, 2, undefined];
    const arr2 = [1, 2, 3];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it("should handle nested empty arrays", () => {
    const arr1 = [1, [], [[], []], 3];
    const arr2 = [1, [2], [[], []], 3];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it("should handle arrays of objects", () => {
    const arr1 = [{ a: 1 }, { b: 2 }];
    const arr2 = [{ a: 1 }, { b: 3 }];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([2, 1]); // 2 fields, 1 matches
  });

  it("should throw an error for max depth exceeded", () => {
    const arr1 = [1, 2, 3, [4, 5, 6]];
    const arr2 = [1, 2, 3, [4, 5, 6]];
    const result = compareArrays(arr1, arr2, 1); // Set max depth to 1
    console.log("Result:", result);
    expect(result).toEqual([3, 3]); // 3 fields, 3 matches
  });

  it("should handle arrays with shuffled identical elements", () => {
    const arr1 = [1, 2, 3];
    const arr2 = [3, 1, 2];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 3]); // 3 fields, 3 matches
  });

  it("should handle arrays with shuffled different elements", () => {
    const arr1 = ["a", "b", "c"];
    const arr2 = ["c", "d", "a"];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it("should handle arrays with mixed types", () => {
    const arr1 = [1, "two", true];
    const arr2 = [1, "two", false];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });

  it("should not count undefined values as matches", () => {
    const arr1 = [1, 2, undefined];
    const arr2 = [1, 2, undefined];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 2]); // 3 fields, 2 matches
  });
});
