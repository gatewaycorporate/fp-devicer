use serde_json::{json, Map, Value};

const EPSILON: f64 = 0.05;
const DEFAULT_Z_THRESHOLD: f64 = 1.5;
const Z_CAP: f64 = 5.0;
const FIELDS: &[(&str, f64)] = &[
    ("userAgent", 10.0),
    ("platform", 20.0),
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

pub fn compute_device_drift_json(
    incoming_json: &str,
    history_json: &str,
    threshold: Option<f64>,
) -> Result<String, String> {
    let incoming: Value = serde_json::from_str(incoming_json).map_err(|e| e.to_string())?;
    let mut history: Vec<Snapshot> =
        serde_json::from_str(history_json).map_err(|e| e.to_string())?;
    history.sort_by(|a, b| b.timestamp_ms.total_cmp(&a.timestamp_ms));
    if history.is_empty() {
        return Err("history must contain at least one snapshot".into());
    }

    let mut stability = Map::new();
    for (field, _) in FIELDS {
        let mut total = 0.0;
        let mut count = 0.0;
        for pair in history.windows(2) {
            let left = pair[0].fingerprint.get(*field);
            let right = pair[1].fingerprint.get(*field);
            if present(left) && present(right) {
                total += comparator(field, left.unwrap(), right.unwrap()).clamp(0.0, 1.0);
                count += 1.0;
            }
        }
        stability.insert(
            (*field).into(),
            json!(if history.len() < 2 || count == 0.0 {
                1.0
            } else {
                total / count
            }),
        );
    }

    let mut all = Vec::new();
    for (field, weight) in FIELDS {
        let Some(incoming_value) = incoming.get(*field) else {
            continue;
        };
        if !present(Some(incoming_value)) {
            continue;
        }
        let mut total = 0.0;
        let mut count = 0.0;
        for snapshot in &history {
            if let Some(value) = snapshot
                .fingerprint
                .get(*field)
                .filter(|value| present(Some(value)))
            {
                total += comparator(field, incoming_value, value).clamp(0.0, 1.0);
                count += 1.0;
            }
        }
        if count > 0.0 {
            let deviation = 1.0 - total / count;
            let stable = stability.get(*field).and_then(Value::as_f64).unwrap_or(1.0);
            all.push((
                field,
                stable,
                deviation,
                deviation / (1.0 - stable + EPSILON),
                *weight,
            ));
        }
    }

    let z_threshold = threshold.unwrap_or(DEFAULT_Z_THRESHOLD);
    let mut suspicious: Vec<_> = all.iter().filter(|(_, _, _, z, _)| *z >= z_threshold)
        .map(|(field, stable, deviation, z, _)| json!({"field": field, "historicalStability": stable, "currentDeviation": deviation, "zScore": z}))
        .collect();
    suspicious.sort_by(|a, b| {
        b["zScore"]
            .as_f64()
            .unwrap()
            .total_cmp(&a["zScore"].as_f64().unwrap())
    });

    let weighted: f64 = all
        .iter()
        .map(|(_, _, _, z, weight)| z.min(Z_CAP) * weight)
        .sum();
    let total_weight: f64 = all.iter().map(|(_, _, _, _, weight)| Z_CAP * weight).sum();
    let drift_score = if total_weight == 0.0 {
        0
    } else {
        ((weighted / total_weight * 100.0).clamp(0.0, 100.0)).round() as u32
    };
    let attractor = attractor_risk(&incoming);
    let pattern = if drift_score >= 75 && attractor >= 50 {
        "CANONICAL_INJECTION"
    } else if drift_score >= 55 && suspicious.len() <= 3 {
        "ABRUPT_CHANGE"
    } else if drift_score >= 30 {
        "INCREMENTAL_DRIFT"
    } else {
        "NORMAL_AGING"
    };
    let newest = history.first().unwrap().timestamp_ms;
    let oldest = history.last().unwrap().timestamp_ms;
    Ok(
        json!({"driftScore": drift_score, "suspiciousFields": suspicious,
        "patternFlag": pattern, "snapshotsAnalyzed": history.len(),
        "baselineWindowMs": newest - oldest})
        .to_string(),
    )
}

#[derive(serde::Deserialize)]
struct Snapshot {
    #[serde(rename = "timestampMs")]
    timestamp_ms: f64,
    fingerprint: Value,
}

fn present(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => false,
        Some(Value::String(v)) => !v.trim().is_empty(),
        Some(Value::Array(v)) => !v.is_empty(),
        Some(_) => true,
    }
}

fn comparator(field: &str, left: &Value, right: &Value) -> f64 {
    if field == "userAgent" || field == "platform" {
        return levenshtein(&string(left).to_lowercase(), &string(right).to_lowercase());
    }
    if matches!(field, "fonts" | "languages" | "plugins" | "mimeTypes") {
        return array_jaccard(left, right);
    }
    if field == "screen" {
        return screen_similarity(left, right);
    }
    if left == right {
        1.0
    } else {
        0.0
    }
}

fn string(value: &Value) -> String {
    match value {
        Value::String(v) => v.clone(),
        Value::Null => String::new(),
        _ => value.to_string(),
    }
}

fn levenshtein(left: &str, right: &str) -> f64 {
    if left == right {
        return 1.0;
    }
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    let right: Vec<_> = right.encode_utf16().collect();
    let mut previous: Vec<usize> = (0..=right.len()).collect();
    for (i, a) in left.encode_utf16().enumerate() {
        let mut current = vec![i + 1; right.len() + 1];
        for (j, b) in right.iter().enumerate() {
            current[j + 1] = (previous[j + 1] + 1)
                .min(current[j] + 1)
                .min(previous[j] + usize::from(a != *b));
        }
        previous = current;
    }
    1.0 - previous[right.len()] as f64 / left.encode_utf16().count().max(right.len()) as f64
}

fn stable(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_default()
}
fn array_jaccard(left: &Value, right: &Value) -> f64 {
    let left: std::collections::HashSet<_> =
        left.as_array().into_iter().flatten().map(stable).collect();
    let right: std::collections::HashSet<_> =
        right.as_array().into_iter().flatten().map(stable).collect();
    if left.is_empty() && right.is_empty() {
        return 0.0;
    }
    let intersection = left.intersection(&right).count();
    intersection as f64 / (left.len() + right.len() - intersection) as f64
}

fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64)
}
fn proximity(left: Option<&Value>, right: Option<&Value>) -> f64 {
    match (number(left), number(right)) {
        (Some(a), Some(b)) if a == b => 1.0,
        (Some(a), Some(b)) => (1.0 - (a - b).abs() / a.abs().max(b.abs()).max(1.0)).max(0.0),
        _ if left == right => 1.0,
        _ => 0.0,
    }
}
fn screen_similarity(left: &Value, right: &Value) -> f64 {
    let (Some(left), Some(right)) = (left.as_object(), right.as_object()) else {
        return 0.5;
    };
    (proximity(left.get("width"), right.get("width"))
        + proximity(left.get("height"), right.get("height"))
        + proximity(left.get("colorDepth"), right.get("colorDepth"))
        + proximity(left.get("pixelDepth"), right.get("pixelDepth"))
        + if left
            .get("orientation")
            .and_then(Value::as_object)
            .and_then(|v| v.get("type"))
            == right
                .get("orientation")
                .and_then(Value::as_object)
                .and_then(|v| v.get("type"))
        {
            1.0
        } else {
            0.0
        })
        / 5.0
}

fn attractor_risk(fp: &Value) -> u32 {
    let text = |key| fp.get(key).map(string).unwrap_or_default().to_lowercase();
    let mut matched = 0;
    let platform = text("platform");
    let ua = text("userAgent");
    let language = text("language");
    if platform.contains("win")
        || ua.contains("android")
        || ua.contains("iphone")
        || ua.contains("ipad")
    {
        matched += 1;
    }
    if ["en", "en-us", "zh-cn"].contains(&language.as_str()) {
        matched += 1;
    }
    if ua.contains("chrome/") || ua.contains("firefox/") || ua.contains("safari/") {
        matched += 1;
    }
    let screen = fp.get("screen").and_then(Value::as_object);
    let resolution = screen.and_then(|s| Some(format!("{}x{}", s.get("width")?, s.get("height")?)));
    if ["1920x1080", "1366x768", "1280x800", "390x844"]
        .contains(&resolution.as_deref().unwrap_or(""))
    {
        matched += 1;
    }
    if [4.0, 8.0].contains(
        &fp.get("hardwareConcurrency")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    ) && [4.0, 8.0].contains(
        &fp.get("deviceMemory")
            .and_then(Value::as_f64)
            .unwrap_or(0.0),
    ) {
        matched += 1;
    }
    if !present(fp.get("canvas")) && !present(fp.get("webgl")) && !present(fp.get("audio")) {
        matched += 1;
    }
    ((matched as f64 / 6.0) * 100.0).round() as u32
}
