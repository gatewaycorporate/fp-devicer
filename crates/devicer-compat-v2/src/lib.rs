mod drift;
mod graph;
mod lsh;
mod scorer;

pub use drift::compute_device_drift_json;
pub use graph::{jaccard_similarity, subnet_key};
pub use lsh::{
    lsh_add, lsh_clear, lsh_new, lsh_query, lsh_remove, lsh_size, query_entries_json, LshIndex,
};
pub use scorer::{
    calculate_score_breakdown_json, compare_hashes, get_hash_json, get_hash_text, ScoreBreakdown,
};

pub const DEFAULT_DECAY_HALF_LIFE_MS: f64 = 30.0 * 24.0 * 60.0 * 60.0 * 1000.0;

pub const FIELD_PATHS: &[&str] = &[
    "userAgent",
    "platform",
    "timezone",
    "language",
    "languages",
    "cookieEnabled",
    "doNotTrack",
    "hardwareConcurrency",
    "deviceMemory",
    "product",
    "productSub",
    "vendor",
    "vendorSub",
    "appName",
    "appVersion",
    "appCodeName",
    "appMinorVersion",
    "buildID",
    "plugins",
    "mimeTypes",
    "screen",
    "fonts",
    "canvas",
    "webgl",
    "audio",
    "highEntropyValues",
];

pub fn compute_field_agreement<Error>(
    mut compare: impl FnMut(&str) -> Result<Option<f64>, Error>,
) -> Result<u32, Error> {
    let mut comparable = 0;
    let mut matching = 0;
    for field in FIELD_PATHS {
        if let Some(similarity) = compare(field)? {
            comparable += 1;
            if similarity >= 0.9 {
                matching += 1;
            }
        }
    }
    Ok(if comparable == 0 {
        50
    } else {
        ((matching as f64 / comparable as f64) * 100.0).round() as u32
    })
}

pub fn compute_temporal_decay_factor(snapshot_age_ms: f64, half_life_ms: f64) -> f64 {
    if snapshot_age_ms <= 0.0 {
        1.0
    } else {
        libm::exp(-snapshot_age_ms / half_life_ms)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_evidence_returns_legacy_midpoint() {
        assert_eq!(compute_field_agreement(|_| Ok::<_, ()>(None)), Ok(50));
    }

    #[test]
    fn threshold_and_rounding_match_legacy_behavior() {
        let result = compute_field_agreement(|field| {
            Ok::<_, ()>(match field {
                "userAgent" => Some(0.9),
                "platform" => Some(1.0),
                "timezone" => Some(0.8999999999999999),
                _ => None,
            })
        });
        assert_eq!(result, Ok(67));
    }

    #[test]
    fn visits_fields_in_order_and_counts_nan_as_disagreement() {
        let mut visited = Vec::new();
        let result = compute_field_agreement(|field| {
            visited.push(field.to_owned());
            Ok::<_, ()>(Some(f64::NAN))
        });
        assert_eq!(visited, FIELD_PATHS);
        assert_eq!(result, Ok(0));
    }

    #[test]
    fn callback_error_stops_iteration() {
        let mut calls = 0;
        let result = compute_field_agreement(|_| {
            calls += 1;
            Err::<Option<f64>, _>("callback failure")
        });
        assert_eq!(result, Err("callback failure"));
        assert_eq!(calls, 1);
    }

    #[test]
    fn legacy_decay_is_efolding_not_halving() {
        assert_eq!(compute_temporal_decay_factor(0.0, 0.0), 1.0);
        assert_eq!(compute_temporal_decay_factor(-1.0, f64::NAN), 1.0);
        assert_eq!(
            compute_temporal_decay_factor(DEFAULT_DECAY_HALF_LIFE_MS, DEFAULT_DECAY_HALF_LIFE_MS),
            (-1.0_f64).exp()
        );
        assert!(compute_temporal_decay_factor(f64::NAN, DEFAULT_DECAY_HALF_LIFE_MS).is_nan());
        assert_eq!(compute_temporal_decay_factor(1.0, 0.0), 0.0);
    }
}
