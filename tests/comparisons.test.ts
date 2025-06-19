import { describe, expect, it } from "vitest";
import { compareArrays, compareDatasets } from "../src/libs/confidence";

const sampleData1 = {"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0","platform":"Win32","timezone":"America/Chicago","language":"en-US","languages":["en-US","en","es","la"],"cookieEnabled":true,"doNotTrack":"1","hardwareConcurrency":8,"deviceMemory":8,"product":"Gecko","productSub":"20030107","vendor":"Google Inc.","vendorSub":"unknown","appName":"Netscape","appVersion":"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0","appCodeName":"Mozilla","appMinorVersion":"unknown","buildID":"unknown","plugins":[{"name":"PDF Viewer","description":"Portable Document Format"},{"name":"Chrome PDF Viewer","description":"Portable Document Format"},{"name":"Chromium PDF Viewer","description":"Portable Document Format"},{"name":"Microsoft Edge PDF Viewer","description":"Portable Document Format"},{"name":"WebKit built-in PDF","description":"Portable Document Format"}],"mimeTypes":[{"type":"application/pdf","suffixes":"pdf","description":"Portable Document Format"},{"type":"text/pdf","suffixes":"pdf","description":"Portable Document Format"}],"screen":{"width":1920,"height":1080,"colorDepth":24,"pixelDepth":24,"orientation":{"type":"landscape-primary","angle":0}},"highEntropyValues":{"architecture":"x86","bitness":"64","brands":[{"brand":"Not)A;Brand","version":"8"},{"brand":"Chromium","version":"138"},{"brand":"Microsoft Edge","version":"138"}],"mobile":false,"model":"","platform":"Windows","platformVersion":"19.0.0","uaFullVersion":"138.0.3351.34"}};

const sampleData2 = {"userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36","platform":"Win32","timezone":"America/Chicago","language":"en-US","languages":["en-US","en"],"cookieEnabled":true,"hardwareConcurrency":16,"deviceMemory":8,"product":"Gecko","productSub":"20030107","vendor":"Google Inc.","vendorSub":"unknown","appName":"Netscape","appVersion":"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36","appCodeName":"Mozilla","appMinorVersion":"unknown","buildID":"unknown","plugins":[{"name":"PDF Viewer","description":"Portable Document Format"},{"name":"Chrome PDF Viewer","description":"Portable Document Format"},{"name":"Chromium PDF Viewer","description":"Portable Document Format"},{"name":"Microsoft Edge PDF Viewer","description":"Portable Document Format"},{"name":"WebKit built-in PDF","description":"Portable Document Format"}],"mimeTypes":[{"type":"application/pdf","suffixes":"pdf","description":"Portable Document Format"},{"type":"text/pdf","suffixes":"pdf","description":"Portable Document Format"}],"screen":{"width":1920,"height":1080,"colorDepth":24,"pixelDepth":24,"orientation":{"type":"landscape-primary","angle":0}},"highEntropyValues":{"architecture":"x86","bitness":"64","brands":[{"brand":"Google Chrome","version":"137"},{"brand":"Chromium","version":"137"},{"brand":"Not/A)Brand","version":"24"}],"mobile":false,"model":"","platform":"Windows","platformVersion":"19.0.0","uaFullVersion":"137.0.7151.119"}};

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
    const arr2 = [3, 1, 4];
    const result = compareArrays(arr1, arr2);
    console.log("Result:", result);
    expect(result).toEqual([3, 0]); // 3 fields, 0 matches
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
    const arr1 = [1, undefined, 3];
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
    const arr1 = [1, [2, [3, [4, [5, [6]]]]]];
    const arr2 = [1, [2, [3, [4, [5, [6]]]]]];
    expect(() => compareArrays(arr1, arr2, 0)).toThrow("Max depth exceeded");
  });
});

describe("Dataset Comparison", () => {
  it("should compare two identical datasets", () => {
    const result = compareDatasets(sampleData1, sampleData1);
    console.log("Result:", result);
    expect(result).toEqual([56, 56]); // 20 fields, 20 matches
  });

  it("should compare two different datasets", () => {
    const result = compareDatasets(sampleData1, sampleData2);
    console.log("Result:", result);
    expect(result).toEqual([53, 44]); // 20 fields, 10 matches
  });
});
