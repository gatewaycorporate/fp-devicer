use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub struct LshIndex {
    num_bands: usize,
    rows_per_band: usize,
    seeds: Vec<u32>,
    buckets: Vec<HashMap<String, HashSet<String>>>,
    locations: HashMap<String, Vec<(usize, String)>>,
    size: usize,
}

impl LshIndex {
    pub fn new(num_hashes: usize, num_bands: usize) -> Result<Self, String> {
        if num_hashes == 0 || num_bands == 0 || !num_hashes.is_multiple_of(num_bands) {
            return Err(format!(
                "numHashes ({num_hashes}) must be divisible by numBands ({num_bands})"
            ));
        }
        Ok(Self {
            num_bands,
            rows_per_band: num_hashes / num_bands,
            seeds: generate_seeds(num_hashes),
            buckets: (0..num_bands).map(|_| HashMap::new()).collect(),
            locations: HashMap::new(),
            size: 0,
        })
    }

    pub fn add(&mut self, device_id: &str, fingerprint: &Value) {
        let Some(signature) = signature(fingerprint, &self.seeds) else {
            return;
        };
        let mut locations = Vec::with_capacity(self.num_bands);
        for band in 0..self.num_bands {
            let start = band * self.rows_per_band;
            let key = signature[start..start + self.rows_per_band]
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(",");
            self.buckets[band]
                .entry(key.clone())
                .or_default()
                .insert(device_id.to_owned());
            locations.push((band, key));
        }
        self.locations
            .entry(device_id.to_owned())
            .or_default()
            .extend(locations);
        self.size += 1;
    }

    pub fn remove(&mut self, device_id: &str) {
        let Some(locations) = self.locations.remove(device_id) else {
            return;
        };
        for (band, key) in locations {
            if let Some(bucket) = self.buckets[band].get_mut(&key) {
                bucket.remove(device_id);
                if bucket.is_empty() {
                    self.buckets[band].remove(&key);
                }
            }
        }
        self.size = self.size.saturating_sub(1);
    }

    pub fn query(&self, fingerprint: &Value) -> Vec<String> {
        let Some(signature) = signature(fingerprint, &self.seeds) else {
            return Vec::new();
        };
        let mut result = HashSet::new();
        for band in 0..self.num_bands {
            let start = band * self.rows_per_band;
            let key = signature[start..start + self.rows_per_band]
                .iter()
                .map(u32::to_string)
                .collect::<Vec<_>>()
                .join(",");
            if let Some(bucket) = self.buckets[band].get(&key) {
                result.extend(bucket.iter().cloned());
            }
        }
        let mut result: Vec<_> = result.into_iter().collect();
        result.sort();
        result
    }

    pub fn clear(&mut self) {
        self.buckets.iter_mut().for_each(|bucket| bucket.clear());
        self.locations.clear();
        self.size = 0;
    }

    pub fn size(&self) -> usize {
        self.size
    }
}

pub fn lsh_new(num_hashes: usize, num_bands: usize) -> Result<LshIndex, String> {
    LshIndex::new(num_hashes, num_bands)
}
pub fn lsh_add(index: &mut LshIndex, device_id: &str, fingerprint: &Value) {
    index.add(device_id, fingerprint);
}
pub fn lsh_remove(index: &mut LshIndex, device_id: &str) {
    index.remove(device_id);
}
pub fn lsh_query(index: &LshIndex, fingerprint: &Value) -> Vec<String> {
    index.query(fingerprint)
}
pub fn lsh_clear(index: &mut LshIndex) {
    index.clear();
}
pub fn lsh_size(index: &LshIndex) -> usize {
    index.size()
}

pub fn query_entries_json(
    entries_json: &str,
    fingerprint_json: &str,
    num_hashes: usize,
    num_bands: usize,
) -> Result<Vec<String>, String> {
    #[derive(serde::Deserialize)]
    struct Entry {
        #[serde(rename = "deviceId")]
        device_id: String,
        fingerprint: Value,
    }
    let entries: Vec<Entry> =
        serde_json::from_str(entries_json).map_err(|error| error.to_string())?;
    let fingerprint: Value =
        serde_json::from_str(fingerprint_json).map_err(|error| error.to_string())?;
    let mut index = LshIndex::new(num_hashes, num_bands)?;
    for entry in entries {
        index.add(&entry.device_id, &entry.fingerprint);
    }
    Ok(index.query(&fingerprint))
}

fn tokens(fingerprint: &Value) -> HashSet<String> {
    let mut result = HashSet::new();
    let Some(object) = fingerprint.as_object() else {
        return result;
    };
    for (field, prefix, property) in [
        ("fonts", "f:", ""),
        ("languages", "l:", ""),
        ("plugins", "p:", "name"),
        ("mimeTypes", "mt:", "type"),
    ] {
        let Some(values) = object.get(field).and_then(Value::as_array) else {
            continue;
        };
        for value in values {
            let text = value.as_str().or_else(|| {
                value
                    .as_object()
                    .and_then(|item| item.get(property))
                    .and_then(Value::as_str)
            });
            if let Some(text) = text.filter(|text| !text.is_empty()) {
                result.insert(format!("{prefix}{text}"));
            }
        }
    }
    result
}

fn signature(fingerprint: &Value, seeds: &[u32]) -> Option<Vec<u32>> {
    let tokens = tokens(fingerprint);
    if tokens.is_empty() {
        return None;
    }
    Some(
        seeds
            .iter()
            .map(|seed| tokens.iter().map(|token| hash(token, *seed)).min().unwrap())
            .collect(),
    )
}

fn hash(token: &str, seed: u32) -> u32 {
    let mut value = seed.wrapping_mul(0x9e3779b9) ^ 0x811c9dc5;
    for code in token.encode_utf16() {
        value ^= u32::from(code);
        value = value.wrapping_mul(0x01000193);
    }
    value ^= value >> 16;
    value = value.wrapping_mul(0x045d9f3b);
    value ^ (value >> 16)
}

fn generate_seeds(count: usize) -> Vec<u32> {
    let mut state = 1664525u32;
    (0..count)
        .map(|_| {
            state = state.wrapping_mul(1664525).wrapping_add(1013904223);
            state
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn add_query_remove_and_clear_match_contract() {
        let mut index = LshIndex::new(16, 4).unwrap();
        let fp = json!({"fonts": ["Arial"], "languages": ["en-US"]});
        index.add("device", &fp);
        assert_eq!(index.size(), 1);
        assert_eq!(index.query(&fp), vec!["device"]);
        index.remove("device");
        assert_eq!(index.size(), 0);
        index.add("device", &fp);
        index.clear();
        assert_eq!(index.query(&fp), Vec::<String>::new());
    }

    #[test]
    fn empty_token_sets_are_not_indexed() {
        let mut index = LshIndex::new(16, 4).unwrap();
        index.add("device", &serde_json::json!({}));
        assert_eq!(index.size(), 0);
        assert!(index.query(&serde_json::json!({})).is_empty());
    }
}
