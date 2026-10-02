use napi::bindgen_prelude::{Function, Promise};
use napi_derive::napi;

#[napi]
pub fn compute_field_agreement(compare: Function<String, Option<f64>>) -> napi::Result<u32> {
    devicer_compat_v2::compute_field_agreement(|field| compare.call(field.to_owned()))
}

#[napi]
pub fn compute_temporal_decay_factor(snapshot_age_ms: f64, half_life_ms: f64) -> f64 {
    devicer_compat_v2::compute_temporal_decay_factor(snapshot_age_ms, half_life_ms)
}

#[napi]
pub fn calculate_score_breakdown_json(
    left_json: String,
    right_json: String,
    snapshot_age_ms: Option<f64>,
    decay_half_life_ms: Option<f64>,
) -> napi::Result<String> {
    devicer_compat_v2::calculate_score_breakdown_json(
        &left_json,
        &right_json,
        snapshot_age_ms,
        decay_half_life_ms,
    )
    .map_err(napi::Error::from_reason)
}

#[napi]
pub fn get_hash_text(value: String) -> napi::Result<String> {
    devicer_compat_v2::get_hash_text(&value).map_err(napi::Error::from_reason)
}

#[napi]
pub fn get_hash_json(value: String) -> napi::Result<String> {
    devicer_compat_v2::get_hash_json(&value).map_err(napi::Error::from_reason)
}

#[napi]
pub fn compare_hashes(first: String, second: String) -> napi::Result<u32> {
    devicer_compat_v2::compare_hashes(&first, &second).map_err(napi::Error::from_reason)
}

#[napi]
pub fn subnet_key(ip: String) -> Option<String> {
    devicer_compat_v2::subnet_key(&ip)
}

#[napi]
pub fn jaccard_similarity(left_json: String, right_json: String) -> napi::Result<f64> {
    let left: Vec<String> = serde_json::from_str(&left_json)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    let right: Vec<String> = serde_json::from_str(&right_json)
        .map_err(|error| napi::Error::from_reason(error.to_string()))?;
    Ok(devicer_compat_v2::jaccard_similarity(&left, &right))
}

#[napi]
pub fn lsh_query_json(
    entries_json: String,
    fingerprint_json: String,
    num_hashes: Option<u32>,
    num_bands: Option<u32>,
) -> napi::Result<String> {
    let result = devicer_compat_v2::query_entries_json(
        &entries_json,
        &fingerprint_json,
        num_hashes.unwrap_or(128) as usize,
        num_bands.unwrap_or(16) as usize,
    )
    .map_err(napi::Error::from_reason)?;
    serde_json::to_string(&result).map_err(|error| napi::Error::from_reason(error.to_string()))
}

#[napi]
pub fn compute_device_drift_json(
    incoming_json: String,
    history_json: String,
    suspicious_z_score_threshold: Option<f64>,
) -> napi::Result<String> {
    devicer_compat_v2::compute_device_drift_json(
        &incoming_json,
        &history_json,
        suspicious_z_score_threshold,
    )
    .map_err(napi::Error::from_reason)
}

#[napi]
pub async fn await_host_number(promise: Promise<f64>) -> napi::Result<f64> {
    promise.await
}

#[napi]
pub async fn await_host_text(promise: Promise<String>) -> napi::Result<String> {
    promise.await
}
