use serde_json::Value;
use std::collections::{BTreeSet, HashSet};
use tlsh::{BucketKind, ChecksumKind, TlshBuilder, Version};

use crate::{compute_temporal_decay_factor, DEFAULT_DECAY_HALF_LIFE_MS, FIELD_PATHS};

const DEFAULT_WEIGHTS: [(&str, f64); 26] = [
    ("userAgent", 20.0),
    ("platform", 15.0),
    ("timezone", 10.0),
    ("language", 15.0),
    ("languages", 20.0),
    ("cookieEnabled", 5.0),
    ("doNotTrack", 5.0),
    ("hardwareConcurrency", 5.0),
    ("deviceMemory", 5.0),
    ("product", 5.0),
    ("productSub", 5.0),
    ("vendor", 5.0),
    ("vendorSub", 5.0),
    ("appName", 5.0),
    ("appVersion", 5.0),
    ("appCodeName", 5.0),
    ("appMinorVersion", 5.0),
    ("buildID", 5.0),
    ("plugins", 15.0),
    ("mimeTypes", 15.0),
    ("screen", 10.0),
    ("fonts", 15.0),
    ("canvas", 30.0),
    ("webgl", 25.0),
    ("audio", 25.0),
    ("highEntropyValues", 20.0),
];

#[allow(non_snake_case)]
#[derive(Debug, Clone, serde::Serialize)]
pub struct ScoreBreakdown {
    pub deviceSimilarity: u32,
    pub evidenceRichness: u32,
    pub fieldAgreement: u32,
    pub structuralStability: u32,
    pub entropyContribution: u32,
    pub attractorRisk: u32,
    pub missingOneSide: u32,
    pub missingBothSides: u32,
    pub composite: u32,
}

fn clamp_score(value: f64) -> u32 {
    value.clamp(0.0, 100.0).round() as u32
}

fn present(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::String(value)) => !value.trim().is_empty(),
        Some(Value::Array(value)) => !value.is_empty(),
        Some(_) => true,
    }
}

fn as_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        Some(Value::Null) | None => String::new(),
        Some(value) => value.to_string(),
    }
}

fn levenshtein(a: &str, b: &str) -> f64 {
    if a == b {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let a: Vec<u16> = a.encode_utf16().collect();
    let b: Vec<u16> = b.encode_utf16().collect();
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut current = vec![i + 1; previous.len()];
        for (j, cb) in b.iter().enumerate() {
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + usize::from(ca != cb));
        }
        previous = current;
    }
    1.0 - previous[b.len()] as f64 / a.len().max(b.len()) as f64
}

fn stable_value(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => format!("b:{value}"),
        Value::Number(value) => format!("n:{value}"),
        Value::String(value) => format!("s:{value}"),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(stable_value)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(values) => values
            .iter()
            .map(|(key, value)| {
                format!(
                    "{}:{}",
                    serde_json::to_string(key).unwrap(),
                    stable_value(value)
                )
            })
            .collect::<Vec<_>>()
            .join(",")
            .pipe(|body| format!("{{{body}}}")),
    }
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}
impl<T> Pipe for T {}

fn jaccard(left: Option<&Value>, right: Option<&Value>) -> f64 {
    let set = |value: Option<&Value>| -> HashSet<String> {
        value
            .and_then(Value::as_array)
            .map(|values| values.iter().map(stable_value).collect())
            .unwrap_or_default()
    };
    let left = set(left);
    let right = set(right);
    if left.is_empty() && right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(&right).count();
    intersection as f64 / (left.len() + right.len() - intersection) as f64
}

fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}

fn numeric_proximity(left: Option<&Value>, right: Option<&Value>) -> f64 {
    match (number(left), number(right)) {
        (None, None) => {
            if left == right {
                1.0
            } else {
                0.0
            }
        }
        (Some(left), Some(right)) => {
            if left == right {
                1.0
            } else {
                (1.0 - (left - right).abs() / left.abs().max(right.abs()).max(1.0)).max(0.0)
            }
        }
        _ => 0.0,
    }
}

fn compare_field(path: &str, left: &Value, right: &Value) -> f64 {
    match path {
        "userAgent" | "platform" => levenshtein(
            &as_string(Some(left)).to_lowercase(),
            &as_string(Some(right)).to_lowercase(),
        ),
        "fonts" | "languages" | "plugins" | "mimeTypes" => jaccard(Some(left), Some(right)),
        "canvas" | "webgl" | "audio" => {
            (as_string(Some(left)) == as_string(Some(right))) as u8 as f64
        }
        "screen" => {
            let left = left.as_object();
            let right = right.as_object();
            if left.is_none() || right.is_none() {
                return 0.5;
            }
            let left = left.unwrap();
            let right = right.unwrap();
            let orientation = left
                .get("orientation")
                .and_then(Value::as_object)
                .and_then(|v| v.get("type"));
            let other_orientation = right
                .get("orientation")
                .and_then(Value::as_object)
                .and_then(|v| v.get("type"));
            (numeric_proximity(left.get("width"), right.get("width"))
                + numeric_proximity(left.get("height"), right.get("height"))
                + numeric_proximity(left.get("colorDepth"), right.get("colorDepth"))
                + numeric_proximity(left.get("pixelDepth"), right.get("pixelDepth"))
                + if orientation == other_orientation {
                    1.0
                } else {
                    0.0
                })
                / 5.0
        }
        _ => (left == right) as u8 as f64,
    }
}

fn weight(path: &str) -> f64 {
    DEFAULT_WEIGHTS
        .iter()
        .find(|(key, _)| *key == path)
        .map(|(_, value)| *value)
        .unwrap_or(5.0)
}

fn recursive(left: &Value, right: &Value, path: &str, depth: usize) -> (f64, f64) {
    if depth > 5 || left.is_null() || right.is_null() {
        return (0.0, 0.0);
    }
    if path.is_empty() {
        if let (Some(left), Some(right)) = (left.as_object(), right.as_object()) {
            let keys: BTreeSet<_> = left.keys().chain(right.keys()).collect();
            return keys
                .iter()
                .map(|key| {
                    recursive(
                        left.get(*key).unwrap_or(&Value::Null),
                        right.get(*key).unwrap_or(&Value::Null),
                        key,
                        depth + 1,
                    )
                })
                .fold((0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1));
        }
    }
    if matches!(
        path,
        "userAgent"
            | "platform"
            | "fonts"
            | "languages"
            | "plugins"
            | "mimeTypes"
            | "screen"
            | "canvas"
            | "webgl"
            | "audio"
    ) {
        let w = weight(path);
        return (w, w * compare_field(path, left, right));
    }
    match (left, right) {
        (Value::Object(left), Value::Object(right)) => {
            let keys: BTreeSet<_> = left.keys().chain(right.keys()).collect();
            keys.iter()
                .map(|key| {
                    recursive(
                        left.get(*key).unwrap_or(&Value::Null),
                        right.get(*key).unwrap_or(&Value::Null),
                        &format!("{path}.{key}"),
                        depth + 1,
                    )
                })
                .fold((0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1))
        }
        (Value::Array(left), Value::Array(right)) => (0..left.len().min(right.len()))
            .map(|index| {
                recursive(
                    &left[index],
                    &right[index],
                    &format!("{path}[{index}]"),
                    depth + 1,
                )
            })
            .fold((0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1)),
        _ => {
            let w = weight(path);
            (w, w * (left == right) as u8 as f64)
        }
    }
}

fn field_similarity(path: &str, left: &Value, right: &Value) -> f64 {
    if matches!((left, right), (Value::Object(_), Value::Object(_))) && !matches!(path, "screen") {
        let (total, matched) = recursive(left, right, path, 0);
        if total > 0.0 {
            return matched / total;
        }
    }
    compare_field(path, left, right)
}

fn evidence(value: &Value) -> u32 {
    clamp_score(
        FIELD_PATHS
            .iter()
            .filter(|field| present(value.get(*field)))
            .count() as f64
            / FIELD_PATHS.len() as f64
            * 100.0,
    )
}
fn agreement(left: &Value, right: &Value) -> u32 {
    let pairs = FIELD_PATHS.iter().filter_map(|field| {
        let a = left.get(*field);
        let b = right.get(*field);
        if present(a) && present(b) {
            Some(field_similarity(field, a.unwrap(), b.unwrap()))
        } else {
            None
        }
    });
    let values: Vec<_> = pairs.collect();
    if values.is_empty() {
        50
    } else {
        clamp_score(
            values.iter().filter(|value| **value >= 0.9).count() as f64 / values.len() as f64
                * 100.0,
        )
    }
}
fn dimension(left: &Value, right: &Value, fields: &[&str]) -> u32 {
    let mut total = 0.0;
    let mut matched = 0.0;
    for field in fields {
        if let (Some(a), Some(b)) = (left.get(*field), right.get(*field)) {
            if present(Some(a)) && present(Some(b)) {
                let w = weight(field);
                total += w;
                matched += w * field_similarity(field, a, b);
            }
        }
    }
    if total > 0.0 {
        clamp_score(matched / total * 100.0)
    } else {
        50
    }
}
fn missing(left: &Value, right: &Value, both: bool) -> u32 {
    let count = FIELD_PATHS
        .iter()
        .filter(|field| {
            let a = present(left.get(*field));
            let b = present(right.get(*field));
            if both {
                !a && !b
            } else {
                a != b
            }
        })
        .count();
    clamp_score(count as f64 / FIELD_PATHS.len() as f64 * 100.0)
}
fn attractor(value: &Value) -> u32 {
    let platform = as_string(value.get("platform")).to_lowercase();
    let ua = as_string(value.get("userAgent")).to_lowercase();
    let language = as_string(value.get("language")).to_lowercase();
    let screen = value.get("screen").and_then(Value::as_object);
    let resolution = screen
        .and_then(|s| {
            Some(format!(
                "{}x{}",
                s.get("width")?.as_i64()?,
                s.get("height")?.as_i64()?
            ))
        })
        .unwrap_or_default();
    let hardware = number(value.get("hardwareConcurrency")).unwrap_or(0.0);
    let memory = number(value.get("deviceMemory")).unwrap_or(0.0);
    let mut signals = 0;
    if platform.contains("win")
        || ua.contains("android")
        || ua.contains("iphone")
        || ua.contains("ipad")
    {
        signals += 1;
    }
    if ["en", "en-us", "zh-cn"].contains(&language.as_str()) {
        signals += 1;
    }
    if ua.contains("chrome/") || ua.contains("firefox/") || ua.contains("safari/") {
        signals += 1;
    }
    if ["1920x1080", "1366x768", "1280x800", "390x844"].contains(&resolution.as_str()) {
        signals += 1;
    }
    if [4.0, 8.0].contains(&hardware) && [4.0, 8.0].contains(&memory) {
        signals += 1;
    }
    if !present(value.get("canvas")) && !present(value.get("webgl")) && !present(value.get("audio"))
    {
        signals += 1;
    }
    clamp_score(signals as f64 / 6.0 * 100.0)
}

fn canonical(value: &Value) -> String {
    match value {
        Value::Object(object) => object
            .iter()
            .filter(|(key, _)| key.as_str() != "behavioralMetrics")
            .collect::<Vec<_>>()
            .pipe(|mut entries| {
                entries.sort_by_key(|(key, _)| *key);
                entries
            })
            .into_iter()
            .map(|(key, value)| format!("{}:{}", key, canonical(value)))
            .collect::<Vec<_>>()
            .join(",")
            .pipe(|body| format!("{{{body}}}")),
        Value::Array(values) => format!(
            "[{}]",
            values.iter().map(canonical).collect::<Vec<_>>().join(",")
        ),
        Value::String(value) => value.clone(),
        Value::Null => String::new(),
        value => value.to_string(),
    }
}

fn tlsh_score(left: &str, right: &str) -> f64 {
    let build = |value: &str| {
        let mut builder = TlshBuilder::new(
            BucketKind::Bucket128,
            ChecksumKind::OneByte,
            Version::Version4,
        );
        builder.update(value.as_bytes());
        builder.build().ok()
    };
    match (build(left), build(right)) {
        (Some(left), Some(right)) => (300.0_f64 - left.diff(&right, true) as f64).max(0.0) / 300.0,
        _ => 0.0,
    }
}

fn build_tlsh(value: &str) -> Result<tlsh::Tlsh, String> {
    let mut builder = TlshBuilder::new(
        BucketKind::Bucket128,
        ChecksumKind::OneByte,
        Version::Version4,
    );
    builder.update(value.as_bytes());
    builder.build().map_err(|error| error.to_string())
}

fn legacy_canonical(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Array(values) => format!(
            "[{}]",
            values
                .iter()
                .map(legacy_canonical)
                .collect::<Vec<_>>()
                .join(",")
        ),
        Value::Object(object) => {
            let mut entries = object.iter().collect::<Vec<_>>();
            entries.sort_by_key(|(key, _)| *key);
            format!(
                "{{{}}}",
                entries
                    .into_iter()
                    .map(|(key, value)| format!("{key}:{}", legacy_canonical(value)))
                    .collect::<Vec<_>>()
                    .join(",")
            )
        }
        Value::String(value) => value.clone(),
        value => value.to_string(),
    }
}

pub fn get_hash_text(value: &str) -> Result<String, String> {
    Ok(build_tlsh(value)?
        .hash()
        .trim_start_matches("T1")
        .to_owned())
}

pub fn get_hash_json(value: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(value).map_err(|error| error.to_string())?;
    get_hash_text(&legacy_canonical(&value))
}

pub fn compare_hashes(first: &str, second: &str) -> Result<u32, String> {
    let first = first
        .parse::<tlsh::Tlsh>()
        .map_err(|error| error.to_string())?;
    let second = second
        .parse::<tlsh::Tlsh>()
        .map_err(|error| error.to_string())?;
    Ok(first.diff(&second, true) as u32)
}

fn object_without_volatile(value: &Value) -> Value {
    value
        .as_object()
        .map(|object| {
            let mut clone = object.clone();
            clone.remove("behavioralMetrics");
            Value::Object(clone)
        })
        .unwrap_or_else(|| value.clone())
}

pub fn calculate_score_breakdown_json(
    left_json: &str,
    right_json: &str,
    snapshot_age_ms: Option<f64>,
    decay_half_life_ms: Option<f64>,
) -> Result<String, String> {
    let left = object_without_volatile(
        &serde_json::from_str(left_json).map_err(|error| error.to_string())?,
    );
    let right = object_without_volatile(
        &serde_json::from_str(right_json).map_err(|error| error.to_string())?,
    );
    let (total, matched) = recursive(&left, &right, "", 0);
    let structural = if total > 0.0 { matched / total } else { 0.0 };
    let fuzzy = tlsh_score(&canonical(&left), &canonical(&right));
    let device = clamp_score((structural * 0.7 + fuzzy * 0.3) * 100.0);
    let age = snapshot_age_ms
        .map(|age| {
            compute_temporal_decay_factor(
                age,
                decay_half_life_ms.unwrap_or(DEFAULT_DECAY_HALF_LIFE_MS),
            )
        })
        .unwrap_or(1.0);
    let evidence = clamp_score((evidence(&left) as f64 + evidence(&right) as f64) / 2.0);
    let fields = agreement(&left, &right);
    let stable = dimension(
        &left,
        &right,
        &[
            "screen",
            "hardwareConcurrency",
            "deviceMemory",
            "platform",
            "highEntropyValues",
        ],
    );
    let entropy = dimension(&left, &right, &["canvas", "webgl", "audio"]);
    let risk = clamp_score((attractor(&left) as f64 + attractor(&right) as f64) / 2.0);
    let missing_one = missing(&left, &right, false);
    let missing_both = missing(&left, &right, true);
    let positive = (device as f64 / 100.0) * 0.62
        + (evidence as f64 / 100.0) * 0.06
        + (fields as f64 / 100.0) * 0.18 * (0.5 + 0.5 * age)
        + (stable as f64 / 100.0) * 0.08
        + (entropy as f64 / 100.0) * 0.06;
    let positive_max = 0.62 + 0.06 + 0.18 * (0.5 + 0.5 * age) + 0.08 + 0.06;
    let penalty = (risk as f64 / 100.0).powi(2)
        * (0.35 + fields as f64 / 100.0 * 0.4 + device as f64 / 100.0 * 0.25)
        * 0.55
        + (1.0 - fields as f64 / 100.0) * (1.0 - device as f64 / 100.0) * 0.08 * age
        + ((60.0 - device as f64).max(0.0) / 60.0) * (1.0 - fields as f64 / 100.0) * 0.16 * age
        + missing_one as f64 / 100.0 * 0.02
        + missing_both as f64 / 100.0 * 0.01;
    let mut composite = clamp_score(((positive - penalty) / positive_max) * 100.0 + 15.0);
    if canonical(&left) != canonical(&right) {
        composite = composite.min(clamp_score(
            (device as f64 + 12.0).clamp(95.0, 99.0) * (0.5 + 0.5 * age) + 70.0 * 0.5 * (1.0 - age),
        ));
    }
    if canonical(&left) == canonical(&right) && risk < 70 {
        composite = 100;
    }
    serde_json::to_string(&ScoreBreakdown {
        deviceSimilarity: device,
        evidenceRichness: evidence,
        fieldAgreement: fields,
        structuralStability: stable,
        entropyContribution: entropy,
        attractorRisk: risk,
        missingOneSide: missing_one,
        missingBothSides: missing_both,
        composite,
    })
    .map_err(|error| error.to_string())
}
