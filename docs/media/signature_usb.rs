//! Compare two scanned signature images after converting each to 224x224 grayscale.
//!
//! ```text
//! cargo run -p devicer-compat-v2 --example signature_usb -- enrollment.png probe.png
//! ```

use image::{imageops::FilterType, DynamicImage, GrayImage, ImageReader, Luma};
use std::{env, process};

const IMAGE_SIZE: u32 = 224;
const MAX_DIMENSION: u32 = 8192;
const PROFILE: &str = "signature.gray8.fit-pad-224.ink.v1";

#[derive(Debug)]
struct ScannedSignature {
    /// Single-channel, row-major tensor values in the range [0, 1].
    pixels: Vec<f32>,
    width: u32,
    height: u32,
    source_width: u32,
    source_height: u32,
}

fn load_signature(path: &str) -> Result<ScannedSignature, String> {
    let mut reader = ImageReader::open(path).map_err(|error| format!("open {path}: {error}"))?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(128 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|error| format!("decode {path}: {error}"))?;
    normalize_signature(image)
}

fn normalize_signature(image: DynamicImage) -> Result<ScannedSignature, String> {
    let (source_width, source_height) = (image.width(), image.height());
    if source_width == 0
        || source_height == 0
        || source_width > MAX_DIMENSION
        || source_height > MAX_DIMENSION
    {
        return Err("unsupported source dimensions".into());
    }
    let mut gray = GrayImage::new(source_width, source_height);
    for (target, source) in gray.pixels_mut().zip(image.to_rgba8().pixels()) {
        let alpha = f32::from(source[3]) / 255.0;
        let luminance = 0.299 * f32::from(source[0])
            + 0.587 * f32::from(source[1])
            + 0.114 * f32::from(source[2]);
        *target = Luma([(luminance * alpha + 255.0 * (1.0 - alpha)).round() as u8]);
    }
    if !gray.pixels().any(|pixel| pixel[0] < 245)
        || !gray.pixels().any(|pixel| pixel[0] > 10)
        || gray.pixels().all(|pixel| pixel == gray.get_pixel(0, 0))
    {
        return Err("insufficient_evidence: blank signature".into());
    }
    let resized = DynamicImage::ImageLuma8(gray)
        .resize(IMAGE_SIZE, IMAGE_SIZE, FilterType::Lanczos3)
        .to_luma8();
    let mut padded = GrayImage::from_pixel(IMAGE_SIZE, IMAGE_SIZE, Luma([255]));
    image::imageops::replace(
        &mut padded,
        &resized,
        i64::from((IMAGE_SIZE - resized.width()) / 2),
        i64::from((IMAGE_SIZE - resized.height()) / 2),
    );
    let pixels = padded
        .pixels()
        .map(|pixel| 1.0 - f32::from(pixel[0]) / 255.0)
        .collect();
    Ok(ScannedSignature {
        pixels,
        width: IMAGE_SIZE,
        height: IMAGE_SIZE,
        source_width,
        source_height,
    })
}

fn pixel_similarity(
    left: &ScannedSignature,
    right: &ScannedSignature,
) -> Result<f32, &'static str> {
    if left.width != right.width || left.height != right.height {
        return Err("incompatible image dimensions");
    }
    if left.pixels.len() != right.pixels.len() || left.pixels.is_empty() {
        return Err("empty image tensor");
    }

    let squared_error = left
        .pixels
        .iter()
        .zip(right.pixels.iter())
        .map(|(left, right)| (left - right).powi(2))
        .sum::<f32>()
        / left.pixels.len() as f32;
    Ok((1.0 - squared_error.sqrt()).clamp(0.0, 1.0))
}

fn main() {
    let arguments: Vec<String> = env::args().collect();
    let (enrollment_path, probe_path) = match arguments.as_slice() {
        [_, enrollment, probe] => (enrollment.as_str(), probe.as_str()),
        _ => {
            eprintln!("usage: {} enrollment-image probe-image", arguments[0]);
            process::exit(2);
        }
    };
    let enrollment = load_signature(enrollment_path).unwrap_or_else(|error| {
        eprintln!("{error}");
        process::exit(1);
    });
    let probe = load_signature(probe_path).unwrap_or_else(|error| {
        eprintln!("{error}");
        process::exit(1);
    });
    let similarity = pixel_similarity(&enrollment, &probe).unwrap_or_else(|error| {
        eprintln!("insufficient_evidence: {error}");
        process::exit(1);
    });
    println!(
        "input:      {}x{} grayscale",
        enrollment.width, enrollment.height
    );
    println!("tensor:     {} values in [0, 1]", enrollment.pixels.len());
    println!("profile:    {PROFILE}");
    println!(
        "sources:    {}x{}, {}x{}",
        enrollment.source_width, enrollment.source_height, probe.source_width, probe.source_height
    );
    println!("comparison: uncalibrated pixel baseline (not writer verification)");
    println!("similarity: {similarity:.4}");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_images() {
        for value in [0, 128, 255] {
            let image = GrayImage::from_pixel(224, 224, Luma([value]));
            assert!(normalize_signature(image.into()).is_err());
        }
        assert!(normalize_signature(DynamicImage::new_rgba8(224, 224)).is_err());
        assert!(normalize_signature(DynamicImage::new_luma8(0, 0)).is_err());
        assert!(normalize_signature(DynamicImage::new_luma8(MAX_DIMENSION + 1, 1)).is_err());
    }

    #[test]
    fn fits_and_pads_landscape_and_portrait() {
        for (width, height) in [(448, 224), (224, 448)] {
            let mut image = GrayImage::from_pixel(width, height, Luma([255]));
            for row in height / 4..height * 3 / 4 {
                for column in width / 4..width * 3 / 4 {
                    image.put_pixel(column, row, Luma([0]));
                }
            }
            let normalized = normalize_signature(image.into()).unwrap();
            assert_eq!(normalized.pixels.len(), 224 * 224);
            assert_eq!(
                (normalized.source_width, normalized.source_height),
                (width, height)
            );
            assert!(normalized
                .pixels
                .iter()
                .all(|value| (0.0..=1.0).contains(value)));
            assert_eq!(normalized.pixels[112 * 224 + 112], 1.0);
            assert_eq!(normalized.pixels[30 * 224 + 30], 0.0);
            let outside_fitted_ink = if width > height {
                70 * 224 + 112
            } else {
                112 * 224 + 70
            };
            assert_eq!(normalized.pixels[outside_fitted_ink], 0.0);
            assert_eq!(pixel_similarity(&normalized, &normalized), Ok(1.0));
        }
    }
}
