export interface FPUserDataSet {
  userAgent: string;
  platform: string;
  timezone: string;
  language: string;
  languages: string[];
  cookieEnabled: boolean;
  doNotTrack: string | boolean;
  hardwareConcurrency: number;
  deviceMemory: number | string;
  product: string;
  productSub: string;
  vendor: string;
  vendorSub: string;
  appName: string;
  appVersion: string;
  appCodeName: string;
  appMinorVersion: string;
  buildID: string;
  plugins: {
    name: string;
    description: string;
  }[];
  mimeTypes: {
    type: string;
    suffixes: string;
    description: string;
  }[];
  screen: {
    width: number;
    height: number;
    colorDepth: number;
    pixelDepth: number;
    orientation: {
      type: string;
      angle: number;
    };
  };
  fonts: string[];
  highEntropyValues: {
    architecture?: string;
    bitness?: string;
    brands?: { brand: string; version: string }[];
    mobile?: boolean;
    model?: string;
    platform?: string;
    platformVersion?: string;
    uaFullVersion?: string;
  };
}

export type FPDataSet<T extends Record<string, any> = FPUserDataSet> = T;

export type Comparator = (value1: any, value2: any, path?: string) => number; // 0.0–1.0 similarity

export interface ComparisonOptions {
  /** Field/path weights (higher = more important). Will be normalized automatically. */
  weights?: Record<string, number>;
  /** Custom similarity functions (your plugin system) */
  comparators?: Record<string, Comparator>;
  /** Fallback weight for any field without an explicit weight */
  defaultWeight?: number;
  /** How much weight to give the TLSH hash component (0–1) */
  tlshWeight?: number;
  /** Max recursion depth for nested objects/arrays */
  maxDepth?: number;
  /** Whether this calculator should use the global registry (default: true) */
  useGlobalRegistry?: boolean;
}