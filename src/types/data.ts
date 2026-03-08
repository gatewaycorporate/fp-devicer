/**
 * Raw browser fingerprint data collected from a user's device.
 * Encompasses navigator properties, screen metrics, installed plugins,
 * font enumeration, and high-entropy client hints.
 */
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

/**
 * Generic fingerprint dataset type.
 * Defaults to {@link FPUserDataSet} but can be substituted with any
 * `Record`-shaped type to support custom fingerprint schemas.
 *
 * @template T - The underlying dataset shape. Must extend `Record<string, any>`.
 */
export type FPDataSet<T extends Record<string, any> = FPUserDataSet> = T;

/**
 * A field-level similarity function used by the confidence calculator.
 *
 * @param value1 - The first value to compare.
 * @param value2 - The second value to compare.
 * @param path - Dot-notation path of the field being compared (e.g. `"screen.width"`).
 * @returns A normalised similarity score in the range `[0, 1]` where
 *   `1` means identical and `0` means completely dissimilar.
 */
export type Comparator = (value1: any, value2: any, path?: string) => number; // 0.0–1.0 similarity

/**
 * Configuration options for {@link createConfidenceCalculator}.
 * All properties are optional; unset values fall back to global registry
 * defaults or built-in defaults.
 */
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