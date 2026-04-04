import { computeAttractorRisk } from "./confidence.js";
// ─── Default model ────────────────────────────────────────────────────────────
/**
 * Attractor-risk model that wraps the built-in heuristic implemented in
 * {@link computeAttractorRisk}.
 *
 * This is the model used when no `attackorModel` is supplied to
 * {@link createConfidenceCalculator} or {@link calculateScoreBreakdown}.
 * Instantiating it explicitly is useful when mixing default and custom models
 * in the same application.
 */
export class DefaultAttractorModel {
    score(fp) {
        return computeAttractorRisk(fp);
    }
}
/**
 * Attractor-risk model driven by a user-supplied frequency table.
 *
 * Each signal dimension (platform, resolution, language, browser family,
 * hardware profile, and missing entropy fields) is scored against the
 * frequency table. The aggregate score is a weighted average of those
 * frequencies, normalised to `[0, 100]`.
 *
 * Dimensions absent from the table fall back to the built-in heuristic for
 * that signal, so a partial table can be supplied without losing coverage.
 *
 * @see {@link createFrequencyTableAttractorModel} for a factory shortcut.
 */
export class FrequencyTableAttractorModel {
    table;
    defaultModel = new DefaultAttractorModel();
    constructor(table) {
        this.table = table;
    }
    score(fp) {
        const signals = [];
        // ── 1. Platform ─────────────────────────────────────────────────────────
        if (this.table.platforms) {
            const platform = String(fp.platform ?? "").toLowerCase();
            const freq = Object.entries(this.table.platforms).find(([key]) => platform.includes(key.toLowerCase()))?.[1];
            signals.push(freq ?? this._defaultPlatformRisk(fp));
        }
        else {
            signals.push(this._defaultPlatformRisk(fp));
        }
        // ── 2. Language ──────────────────────────────────────────────────────────
        if (this.table.languages) {
            const lang = String(fp.language ?? "").toLowerCase();
            const freq = Object.entries(this.table.languages).find(([key]) => lang === key.toLowerCase() || lang.startsWith(key.toLowerCase() + "-") || key.toLowerCase().startsWith(lang + "-"))?.[1];
            signals.push(freq ?? this._defaultLanguageRisk(fp));
        }
        else {
            signals.push(this._defaultLanguageRisk(fp));
        }
        // ── 3. Browser family ────────────────────────────────────────────────────
        if (this.table.browserFamilies) {
            const ua = String(fp.userAgent ?? "").toLowerCase();
            const freq = Object.entries(this.table.browserFamilies).find(([key]) => ua.includes(key.toLowerCase()))?.[1];
            signals.push(freq ?? this._defaultBrowserRisk(fp));
        }
        else {
            signals.push(this._defaultBrowserRisk(fp));
        }
        // ── 4. Screen resolution ─────────────────────────────────────────────────
        if (this.table.resolutions) {
            const w = fp.screen?.width;
            const h = fp.screen?.height;
            const key = w && h ? `${w}x${h}` : "";
            const freq = key ? this.table.resolutions[key] ?? this.table.resolutions[key.toLowerCase()] : undefined;
            signals.push(freq ?? this._defaultResolutionRisk(fp));
        }
        else {
            signals.push(this._defaultResolutionRisk(fp));
        }
        // ── 5. Hardware profile ──────────────────────────────────────────────────
        if (this.table.hardwareProfiles) {
            const c = Number(fp.hardwareConcurrency ?? 0);
            const m = Number(fp.deviceMemory ?? 0);
            const match = this.table.hardwareProfiles.find((p) => p.concurrency === c && p.memory === m);
            signals.push(match?.frequency ?? this._defaultHardwareRisk(fp));
        }
        else {
            signals.push(this._defaultHardwareRisk(fp));
        }
        // ── 6. Absent entropy fields ─────────────────────────────────────────────
        // This dimension always uses the original heuristic — it's a structural
        // absence, not a value-frequency concern.
        const hasCanvas = fp.canvas != null && String(fp.canvas).trim().length > 0;
        const hasWebgl = fp.webgl != null && String(fp.webgl).trim().length > 0;
        const hasAudio = fp.audio != null && String(fp.audio).trim().length > 0;
        signals.push(!hasCanvas && !hasWebgl && !hasAudio ? 1 : 0);
        const avg = signals.reduce((a, b) => a + b, 0) / signals.length;
        return Math.round(Math.max(0, Math.min(100, avg * 100)));
    }
    // ── Fallback helpers (mirror the built-in heuristic per-signal) ─────────────
    _defaultPlatformRisk(fp) {
        const platform = String(fp.platform ?? "").toLowerCase();
        const ua = String(fp.userAgent ?? "").toLowerCase();
        return platform.includes("win") || ua.includes("android") || ua.includes("iphone") || ua.includes("ipad")
            ? 1
            : 0;
    }
    _defaultLanguageRisk(fp) {
        const lang = String(fp.language ?? "").toLowerCase();
        return ["en", "en-us", "zh-cn"].includes(lang) ? 1 : 0;
    }
    _defaultBrowserRisk(fp) {
        const ua = String(fp.userAgent ?? "").toLowerCase();
        return ua.includes("chrome/") || ua.includes("firefox/") || ua.includes("safari/") ? 1 : 0;
    }
    _defaultResolutionRisk(fp) {
        const ATTRACTOR_RESOLUTIONS = new Set(["1920x1080", "1366x768", "1280x800", "390x844"]);
        const w = fp.screen?.width;
        const h = fp.screen?.height;
        const key = w && h ? `${w}x${h}` : "";
        return ATTRACTOR_RESOLUTIONS.has(key) ? 1 : 0;
    }
    _defaultHardwareRisk(fp) {
        const c = Number(fp.hardwareConcurrency ?? 0);
        const m = Number(fp.deviceMemory ?? 0);
        return (c === 4 || c === 8) && (m === 4 || m === 8) ? 1 : 0;
    }
}
/**
 * Convenience factory for {@link FrequencyTableAttractorModel}.
 *
 * @param table - Frequency table describing signal commonness in the
 *                target population.
 * @returns     A fully constructed {@link AttractorModel}.
 *
 * @example
 * ```ts
 * const model = createFrequencyTableAttractorModel({
 *   platforms:   { "Win32": 0.72, "MacIntel": 0.18 },
 *   resolutions: { "1920x1080": 0.48, "2560x1440": 0.22 },
 *   languages:   { "en-US": 0.68 },
 * });
 *
 * const calculator = createConfidenceCalculator({ attractorModel: model });
 * const score = calculator.calculateConfidence(fp1, fp2);
 * ```
 */
export function createFrequencyTableAttractorModel(table) {
    return new FrequencyTableAttractorModel(table);
}
