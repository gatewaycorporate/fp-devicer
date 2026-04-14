# MetaDock Anti-Fingerprint Capabilities

MetaDock includes a comprehensive anti-fingerprinting system for its browser that spoofs the signals commonly used by tracking, bot detection, and cross-site identification services. Each spoof is seeded per profile so two MetaDock profiles running on the same physical machine look like two different devices.

All settings can be configured globally in Settings → Privacy & Security or per-profile via the profile card's **Fingerprint** button.

---

## 1. Configuration Model

### Presets

| Preset | Modules Enabled | Noise Levels |
|--------|-----------------|--------------|
| **None** | All disabled | — |
| **Balanced** | Canvas, Audio, ClientRects | Subtle |
| **Maximum** | All modules | Aggressive |
| **Custom** | User-configured per module | User-chosen |

### Seed System

Every spoof is driven by a deterministic seed per profile:

- **Default**: `SHA-256(profile_name + "metadock-fingerprint")` — same profile → same fingerprint across restarts
- **Custom seed**: User can supply a string to force a specific deterministic identity
- **Randomize on refresh**: Regenerates a fresh `QUuid` seed on every page navigation — every page load looks like a different device. Trade-off: no per-session consistency, which itself is a mild anomaly

### Platform Emulation

A single selector chooses the target OS profile, which constrains GPU selection and device templates to stay internally coherent:

- **Windows** → D3D11 ANGLE renderers, 40px taskbar device templates
- **macOS** → Metal/Apple Silicon renderers, 25px menu-bar templates with Retina DPR
- **Linux** → Mesa/OpenGL renderers, ~30px panel templates

This prevents the #1 fingerprint red flag: claiming a Windows UA but reporting an Apple Metal GPU (or vice versa). CreepJS's 413-entry GPU coherence whitelist explicitly checks combinations like these.

---

## 2. Spoofing Modules

### 2.1 Canvas Fingerprint

**What it targets**: `HTMLCanvasElement.toDataURL`, `toBlob`, and `CanvasRenderingContext2D.getImageData` — the #1 fingerprinting technique on the web.

**How it works**: Adds seeded random per-pixel RGB noise (preserving alpha) to drawn content ≥16×16px. The PRNG is xoshiro128** seeded with MurmurHash3 of the effective seed, giving deterministic but unique noise per profile.

**Noise levels**:
- Subtle: ±1 per RGB channel
- Moderate: ±3
- Aggressive: ±8

**Result**: Each profile produces a different canvas hash; the same profile produces the same hash across refreshes (unless randomize-on-refresh is on).

### 2.2 WebGL Fingerprint

**What it targets**: GPU vendor, renderer, extensions, parameters — WebGL reveals hardware specifics that uniquely identify machines.

**How it works**:
- Hooks `WebGLRenderingContext` + `WebGL2RenderingContext`: `getParameter`, `getSupportedExtensions`, `getExtension`, `readPixels`, `getShaderPrecisionFormat`
- Full Chromium ANGLE-compatible parameter map for all 19 GL constants (VENDOR, RENDERER, VERSION, UNMASKED_VENDOR_WEBGL, UNMASKED_RENDERER_WEBGL, MAX_TEXTURE_SIZE, etc.)
- `readPixels` output gets per-channel noise (±1) to defeat pixel-level shader fingerprinting
- `WEBGL_debug_renderer_info` extension fully spoofed

**GPU pool**: 90+ real-world GPU profiles with exact Chromium ANGLE renderer strings:

| Platform | Coverage |
|----------|----------|
| Windows (D3D11) | Intel HD/UHD/Iris/Arc, AMD Vega/RDNA, NVIDIA GTX 10-series through RTX 40-series (inc. Laptop variants) |
| macOS (Metal) | Apple M1/M2/M3/M4 with Pro/Max variants |
| Linux (Mesa/OpenGL) | Intel iGPU (KBL/CFL/TGL/ADL/RPL), AMD radeonsi, NVIDIA proprietary driver, llvmpipe |

`WebGLGPUProfile::fromSeed(seed, platform)` deterministically picks a profile from the filtered subset — so a profile with platform=Windows always gets a D3D11 GPU, and a different profile gets a different GPU.

**User override**: Manual "GPU Preset" dropdown in the profile dialog forces a specific GPU (e.g., "NVIDIA GTX 1060") ignoring seed-based selection.

### 2.3 Audio Fingerprint

**What it targets**: `AudioContext` fingerprinting via `AnalyserNode.getFloatFrequencyData`, `getByteFrequencyData`, `OfflineAudioContext.startRendering`, and oscillator frequency.

**How it works**: Adds seeded noise to frequency data and oscillator values. Noise levels:
- Subtle: 0.001 freq noise, 1.0 Hz oscillator offset
- Moderate: 0.01 / 5.0 Hz
- Aggressive: 0.05 / 15.0 Hz

### 2.4 ClientRects / DOMRect Spoofing

**What it targets**: Sub-pixel element positions returned by `Element.prototype.getBoundingClientRect`, `getClientRects`, `Range.prototype.getBoundingClientRect`, `getClientRects`. These values vary by font hinting engine (DirectWrite / Core Text / FreeType) and DPI and are used for passive fingerprinting.

**How it works**:
- `WeakMap` keyed on each element/range stores a persistent `(dx, dy)` offset in the ±0.1px range, generated from the PRNG on first access
- Returns `new DOMRect(x + dx, y + dy, width, height)` — preserves math invariants (`right === left + width`, `bottom === top + height`) that CreepJS explicitly checks
- Zero-dimension elements return unchanged (skipping them avoids breaking hidden-element detection)
- Same element called twice returns the same offset (defeats averaging-based detection)

### 2.5 Font Fingerprinting

**What it targets**: Font enumeration via `window.queryLocalFonts`, `document.fonts.check`, and canvas text measurement (`measureText`).

**How it works**:
- `queryLocalFonts` → returns empty array
- `document.fonts.check` → parses the CSS font shorthand and returns `false` for any family not in the whitelist
- `measureText` → adds ±0.0003% seeded noise to `TextMetrics.width` via `Object.defineProperty`
- **Whitelist**: 34 base Windows 10/11 system fonts (Arial, Calibri, Cambria, Consolas, Segoe UI, Times New Roman, Tahoma, etc.) — what a clean Windows install reports

### 2.6 Navigator / Screen / Audio Properties (Device Profile)

**What it targets**: Hardware signals used as cross-signal consistency checks:
- `navigator.hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`
- `screen.width/height/availWidth/availHeight/colorDepth/pixelDepth`
- `window.devicePixelRatio`
- `AudioContext.sampleRate/baseLatency/outputLatency`
- `AudioDestinationNode.maxChannelCount`

**How it works**: A curated `DeviceProfile` template table per platform defines internally coherent value combinations (e.g., "1920×1080 / 8 cores / 8 GB / DPR 1.0 / 48 kHz / 40 px taskbar"). The seed picks one template via SHA-256. `Object.defineProperty` overrides the getters on `navigator`, `screen`, `window`, and the AudioContext prototypes.

**Template count**:
- Windows: 13 templates (budget laptop → 4K enthusiast)
- macOS: 10 templates (MBA/MBP M1-M3 Max, iMac 24", Mac Studio)
- Linux: 10 templates (desktop/laptop FHD/1440p/4K, ThinkPad, developer workstation)

All values in a template are coherent: a 4-core budget laptop always gets 4 GB RAM and 44.1 kHz audio; a 16-core enthusiast desktop gets 32-GB-worthy values and higher viewport dims.

### 2.7 Geolocation / Timezone / Locale

**What it targets**: `navigator.geolocation`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, and the locale-dependent behavior of `Date`, `Intl`, etc.

**How it works**: Uses the **Chrome DevTools Protocol** — this is a native browser-level override, not JavaScript injection, so it's undetectable by JS tampering checks (no `lied: true` on CreepJS for these properties).

Three CDP calls fire once per WebView2 session:
- `Emulation.setGeolocationOverride` — `{latitude, longitude, accuracy}`
- `Emulation.setTimezoneOverride` — IANA timezone ID (e.g. `"America/New_York"`)
- `Emulation.setLocaleOverride` — BCP-47 locale (e.g. `"en-US"`)

**Auto mode**: Resolves the configured proxy's IP via the bundled DB-IP Lite offline database (no external API calls — privacy-safe). Returns lat/lon/accuracy/timezone/country. Country ISO → locale via a 60-entry mapping table. Deterministic ±0.0001° (~10m) jitter is applied from the fingerprint seed so coords aren't identical every call.

**Manual mode**: User enters lat/lon/timezone/locale directly.

**Permission auto-grant**: When geolocation spoofing is enabled, permission for location is auto granted so sites receive the spoofed coords without a user prompt.

**Coherence benefit**: If a profile's proxy is in London, the browser reports London coords, Europe/London timezone, and en-GB locale — all consistent. This defeats the biggest cross-signal fingerprint mismatch (US IP + Berlin timezone + Japanese locale = instant bot flag).

---

## 3. Anti-Detection Layer

Always injected alongside any enabled module:

- `Function.prototype.toString` is hooked to return `"function X() { [native code] }"` for all spoofed methods, defeating simple `fn.toString()` detection
- `Object.getOwnPropertyDescriptor` is protected by a descriptor cache so property overrides don't leak
- Stack trace filtering to scrub spoof-related frames from thrown errors
- `MutationObserver` propagates the spoofs to same-origin iframes
- Sets a `window._fpHooked = true` flag for internal reference

**Limitations**: JS-only spoofing will always be detectable by determined cross-iframe checks, prototype descriptor inspection (CreepJS), or worker-thread timing side-channels (measuring actual CPU parallelism despite spoofed `hardwareConcurrency`). MetaDock's goal is profile separation for tracking-cookie-class fingerprinters (FingerprintJS, etc.) — not defeating military-grade lie detectors like CreepJS. Typical result: ~100-120 lies on CreepJS but passes real-world bot detection (Cloudflare Bot Fight Mode, DataDome, PerimeterX) because those services weight canvas/WebGL hashes, TLS fingerprint, and IP reputation much more than JS lie detection.