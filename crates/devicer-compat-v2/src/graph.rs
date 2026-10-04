pub fn subnet_key(ip: &str) -> Option<String> {
    let parts: Vec<_> = ip.split('.').collect();
    if parts.len() != 4 || parts.iter().any(|part| part.parse::<f64>().is_err()) {
        return None;
    }
    Some(format!("{}.{}.{}", parts[0], parts[1], parts[2]))
}

pub fn jaccard_similarity(left: &[String], right: &[String]) -> f64 {
    if left.is_empty() && right.is_empty() {
        return 1.0;
    }
    let left: std::collections::HashSet<_> = left.iter().collect();
    let right: std::collections::HashSet<_> = right.iter().collect();
    let intersection = left.intersection(&right).count();
    let union = left.len() + right.len() - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subnet_rejects_non_ipv4_values() {
        assert_eq!(subnet_key("192.168.1.123"), Some("192.168.1".into()));
        assert_eq!(subnet_key("192.168.1.256"), Some("192.168.1".into()));
        assert_eq!(subnet_key("::1"), None);
    }

    #[test]
    fn jaccard_matches_public_graph_helper() {
        assert_eq!(jaccard_similarity(&[], &[]), 1.0);
        assert_eq!(
            jaccard_similarity(&["a".into()], &["a".into(), "b".into()]),
            0.5
        );
    }
}
