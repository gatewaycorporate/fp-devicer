//! Compare two scanned signature images after converting each to 224x224 grayscale.
//!
//! DetailSemNet is an offline signature model: it expects rasterized signature
//! images rather than e-pen stroke reports. This example implements the input
//! boundary and a deterministic pixel baseline. With the `candle-runtime`
//! feature and a converted checkpoint, `--checkpoint` runs Candle DSNet.
//!
//! ```text
//! cargo run -p devicer-compat-v2 --example signature_usb -- enrollment.png probe.png
//! cargo run -p devicer-compat-v2 --features candle-runtime --example signature_usb -- \
//!   --checkpoint models/DetailSemNet_BHSig_B_best.safetensors enrollment.png probe.png
//! ```

use image::{imageops::FilterType, ImageReader};
use std::{env, process};

#[cfg(feature = "candle-runtime")]
use candle_core::{Device, Tensor};
#[cfg(feature = "candle-runtime")]
use devicer_compat_v2::dsnet::DsNet;

const IMAGE_SIZE: u32 = 224;
const MATCH_THRESHOLD: f32 = 0.90;

#[derive(Debug)]
struct ScannedSignature {
    /// Single-channel, row-major tensor values in the range [0, 1].
    pixels: Vec<f32>,
    width: u32,
    height: u32,
}

#[derive(Debug)]
enum Decision {
    Match,
    NonMatch,
    InsufficientEvidence(&'static str),
}

fn load_signature(path: &str) -> Result<ScannedSignature, String> {
    let image = ImageReader::open(path)
        .map_err(|error| format!("open {path}: {error}"))?
        .decode()
        .map_err(|error| format!("decode {path}: {error}"))?
        .grayscale();
    let resized = image.resize_exact(IMAGE_SIZE, IMAGE_SIZE, FilterType::Lanczos3);
    let pixels = resized
        .to_luma8()
        .pixels()
        .map(|pixel| 1.0 - f32::from(pixel[0]) / 255.0)
        .collect();
    Ok(ScannedSignature {
        pixels,
        width: IMAGE_SIZE,
        height: IMAGE_SIZE,
    })
}

fn pixel_similarity(left: &ScannedSignature, right: &ScannedSignature) -> (Decision, f32) {
    if left.width != right.width || left.height != right.height {
        return (
            Decision::InsufficientEvidence("incompatible image dimensions"),
            0.0,
        );
    }
    if left.pixels.len() != right.pixels.len() || left.pixels.is_empty() {
        return (Decision::InsufficientEvidence("empty image tensor"), 0.0);
    }

    // This is only a baseline. DetailSemNet should replace this with its
    // learned pairwise distance over the two preprocessed image tensors.
    let squared_error = left
        .pixels
        .iter()
        .zip(right.pixels.iter())
        .map(|(left, right)| (left - right).powi(2))
        .sum::<f32>()
        / left.pixels.len() as f32;
    let similarity = (1.0 - squared_error.sqrt()).clamp(0.0, 1.0);
    let decision = if similarity >= MATCH_THRESHOLD {
        Decision::Match
    } else {
        Decision::NonMatch
    };
    (decision, similarity)
}

#[cfg(feature = "candle-runtime")]
fn dsnet_similarity(
    model: &DsNet,
    left: &ScannedSignature,
    right: &ScannedSignature,
    device: &Device,
) -> Result<(Decision, f32), String> {
    let image_size = IMAGE_SIZE as usize;
    let left = Tensor::from_vec(left.pixels.clone(), (1, 1, image_size, image_size), device)
        .map_err(|error| format!("build enrollment tensor: {error}"))?;
    let right = Tensor::from_vec(right.pixels.clone(), (1, 1, image_size, image_size), device)
        .map_err(|error| format!("build probe tensor: {error}"))?;
    let similarity = model
        .similarity(&left, &right)
        .map_err(|error| format!("run Candle DSNet: {error}"))?;
    let decision = if similarity >= MATCH_THRESHOLD {
        Decision::Match
    } else {
        Decision::NonMatch
    };
    Ok((decision, similarity))
}

fn main() {
    let arguments: Vec<String> = env::args().collect();
    let (checkpoint, enrollment_path, probe_path) = match arguments.as_slice() {
        [_, enrollment, probe] => (None, enrollment.as_str(), probe.as_str()),
        [_, flag, checkpoint, enrollment, probe] if flag == "--checkpoint" => (
            Some(checkpoint.as_str()),
            enrollment.as_str(),
            probe.as_str(),
        ),
        _ => {
            eprintln!(
                "usage: {} [--checkpoint model.safetensors] enrollment-image probe-image",
                arguments[0]
            );
            process::exit(2);
        }
    };
    #[cfg(not(feature = "candle-runtime"))]
    if checkpoint.is_some() {
        eprintln!("--checkpoint requires --features candle-runtime");
        process::exit(2);
    }
    let enrollment = load_signature(enrollment_path).unwrap_or_else(|error| {
        eprintln!("{error}");
        process::exit(1);
    });
    let probe = load_signature(probe_path).unwrap_or_else(|error| {
        eprintln!("{error}");
        process::exit(1);
    });
    #[cfg(feature = "candle-runtime")]
    let (decision, similarity, comparison_kind) = if let Some(checkpoint) = checkpoint {
        let device = Device::Cpu;
        let model = DsNet::load(checkpoint, &device).unwrap_or_else(|error| {
            eprintln!("load Candle DSNet checkpoint: {error}");
            process::exit(1);
        });
        let (decision, similarity) = dsnet_similarity(&model, &enrollment, &probe, &device)
            .unwrap_or_else(|error| {
                eprintln!("{error}");
                process::exit(1);
            });
        (decision, similarity, "Candle DSNet cosine embedding")
    } else {
        let (decision, similarity) = pixel_similarity(&enrollment, &probe);
        (decision, similarity, "pixel baseline")
    };
    #[cfg(not(feature = "candle-runtime"))]
    let (decision, similarity, comparison_kind) = {
        let (decision, similarity) = pixel_similarity(&enrollment, &probe);
        (decision, similarity, "pixel baseline")
    };
    println!(
        "input:      {}x{} grayscale",
        enrollment.width, enrollment.height
    );
    println!("tensor:     {} values in [0, 1]", enrollment.pixels.len());
    println!("comparison: {comparison_kind}");
    println!("similarity: {similarity:.4}");
    match decision {
        Decision::Match => println!("decision:   match"),
        Decision::NonMatch => println!("decision:   non_match"),
        Decision::InsufficientEvidence(reason) => {
            println!("decision:   insufficient_evidence ({reason})")
        }
    }
}
