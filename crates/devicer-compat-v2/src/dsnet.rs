use candle_core::{DType, Device, Result, Tensor};
use candle_nn::{self as nn, BatchNorm, Conv2d, LayerNorm, Linear, Module, ModuleT, VarBuilder};

const DEPTHS: [usize; 4] = [3, 3, 9, 3];
const DIMS: [usize; 4] = [96, 192, 320, 384];
const HEADS: [usize; 4] = [3, 6, 10, 12];
const ATTENTION_HEADS: [usize; 18] = [1, 1, 1, 3, 3, 3, 7, 7, 7, 7, 9, 9, 9, 9, 9, 11, 11, 11];

struct ConvBn {
    conv: Conv2d,
    norm: BatchNorm,
}

impl ConvBn {
    fn new(
        in_channels: usize,
        out_channels: usize,
        kernel: usize,
        stride: usize,
        padding: usize,
        groups: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        Ok(Self {
            conv: nn::conv2d(
                in_channels,
                out_channels,
                kernel,
                nn::Conv2dConfig {
                    padding,
                    stride,
                    groups,
                    ..Default::default()
                },
                vb.pp("proj"),
            )?,
            norm: nn::batch_norm(out_channels, 1e-5, vb.pp("norm"))?,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        self.norm.forward_t(&self.conv.forward(x)?, false)
    }
}

struct FirstPatchEmbed {
    proj1: Conv2d,
    norm1: BatchNorm,
    proj2: Conv2d,
    norm2: BatchNorm,
}

impl FirstPatchEmbed {
    fn new(vb: VarBuilder) -> Result<Self> {
        Ok(Self {
            proj1: nn::conv2d(
                1,
                48,
                3,
                nn::Conv2dConfig {
                    padding: 1,
                    stride: 2,
                    ..Default::default()
                },
                vb.pp("proj1"),
            )?,
            norm1: nn::batch_norm(48, 1e-5, vb.pp("norm1"))?,
            proj2: nn::conv2d(
                48,
                96,
                3,
                nn::Conv2dConfig {
                    padding: 1,
                    stride: 2,
                    ..Default::default()
                },
                vb.pp("proj2"),
            )?,
            norm2: nn::batch_norm(96, 1e-5, vb.pp("norm2"))?,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let x = self
            .norm1
            .forward_t(&self.proj1.forward(x)?, false)?
            .gelu()?;
        let x = self.norm2.forward_t(&self.proj2.forward(&x)?, false)?;
        x.permute((0, 2, 3, 1))
    }
}

struct HighMixer {
    conv1: Conv2d,
    depthwise: Conv2d,
    pool_proj: Conv2d,
}

impl HighMixer {
    fn new(dim: usize, vb: VarBuilder) -> Result<Self> {
        let input = dim / 2;
        Ok(Self {
            conv1: nn::conv2d_no_bias(input, dim, 1, nn::Conv2dConfig::default(), vb.pp("conv1"))?,
            depthwise: nn::conv2d_no_bias(
                dim,
                dim,
                3,
                nn::Conv2dConfig {
                    padding: 1,
                    groups: dim,
                    ..Default::default()
                },
                vb.pp("proj1"),
            )?,
            pool_proj: nn::conv2d(input, dim, 1, nn::Conv2dConfig::default(), vb.pp("proj2"))?,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let channels = x.dim(1)?;
        let half = channels / 2;
        let high = x.narrow(1, 0, half)?;
        let low = x.narrow(1, half, half)?;
        let high = self
            .depthwise
            .forward(&self.conv1.forward(&high)?)?
            .gelu()?;
        let low = low.pad_with_zeros(2, 1, 1)?.pad_with_zeros(3, 1, 1)?;
        let low = self
            .pool_proj
            .forward(&low.max_pool2d_with_stride(3, 1)?)?
            .gelu()?;
        Tensor::cat(&[high, low], 1)
    }
}

struct LowMixer {
    qkv: Linear,
    heads: usize,
    dim: usize,
    pool_size: usize,
}

impl LowMixer {
    fn new(dim: usize, heads: usize, pool_size: usize, vb: VarBuilder) -> Result<Self> {
        Ok(Self {
            qkv: nn::linear(dim, dim * 3, vb.pp("qkv"))?,
            heads,
            dim,
            pool_size,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let (batch, _, height, width) = x.dims4()?;
        let tokens = x
            .permute((0, 2, 3, 1))?
            .reshape((batch, height * width, self.dim))?;
        let qkv = self
            .qkv
            .forward(&tokens)?
            .reshape((batch, height * width, 3, self.heads, self.dim / self.heads))?
            .permute((2, 0, 3, 1, 4))?;
        let q = qkv.narrow(0, 0, 1)?.squeeze(0)?;
        let k = qkv.narrow(0, 1, 1)?.squeeze(0)?;
        let v = qkv.narrow(0, 2, 1)?.squeeze(0)?;
        let scale = ((self.dim / self.heads) as f64).sqrt();
        let attention =
            nn::ops::softmax(&q.matmul(&k.transpose(2, 3)?)?.affine(1.0 / scale, 0.0)?, 3)?;
        let output = attention
            .matmul(&v)?
            .transpose(1, 2)?
            .reshape((batch, height, width, self.dim))?
            .permute((0, 3, 1, 2))?;
        if self.pool_size > 1 {
            output.upsample_nearest2d(height * self.pool_size, width * self.pool_size)
        } else {
            Ok(output)
        }
    }
}

struct Mixer {
    high: HighMixer,
    low: LowMixer,
    reduce_high: Conv2d,
    reduce_low: Conv2d,
    fuse: Conv2d,
    project: Conv2d,
    pool_size: usize,
}

impl Mixer {
    fn new(
        dim: usize,
        heads: usize,
        attention_head: usize,
        pool_size: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        let head_dim = dim / heads;
        let low_dim = attention_head * head_dim;
        let high_dim = dim - low_dim;
        let fused_dim = low_dim + high_dim * 2;
        Ok(Self {
            high: HighMixer::new(high_dim, vb.pp("high_mixer"))?,
            low: LowMixer::new(low_dim, attention_head, pool_size, vb.pp("low_mixer"))?,
            reduce_high: nn::conv2d(
                dim,
                high_dim,
                1,
                nn::Conv2dConfig::default(),
                vb.pp("reduce_h"),
            )?,
            reduce_low: nn::conv2d(
                dim,
                low_dim,
                1,
                nn::Conv2dConfig::default(),
                vb.pp("reduce_l"),
            )?,
            fuse: nn::conv2d_no_bias(
                fused_dim,
                fused_dim,
                3,
                nn::Conv2dConfig {
                    padding: 1,
                    groups: fused_dim,
                    ..Default::default()
                },
                vb.pp("conv_fuse"),
            )?,
            project: nn::conv2d(
                fused_dim,
                dim,
                1,
                nn::Conv2dConfig::default(),
                vb.pp("proj"),
            )?,
            pool_size,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let x = x.permute((0, 3, 1, 2))?;
        let (high, low) = if self.pool_size > 1 {
            let pooled = x.avg_pool2d_with_stride(self.pool_size, self.pool_size)?;
            let upsampled = pooled.upsample_nearest2d(x.dim(2)?, x.dim(3)?)?;
            (x.broadcast_sub(&upsampled)?, pooled)
        } else {
            (x.clone(), x.clone())
        };
        let high = self.reduce_high.forward(&high)?;
        let low = self.reduce_low.forward(&low)?;
        let high = self.high.forward(&high)?;
        let low = self.low.forward(&low)?;
        let joined = Tensor::cat(&[high, low], 1)?;
        let joined = joined.broadcast_add(&self.fuse.forward(&joined)?)?;
        self.project.forward(&joined)?.permute((0, 2, 3, 1))
    }
}

struct Block {
    norm1: LayerNorm,
    mixer: Mixer,
    norm2: LayerNorm,
    fc1: Linear,
    fc2: Linear,
    gamma1: Tensor,
    gamma2: Tensor,
}

impl Block {
    fn new(
        dim: usize,
        heads: usize,
        attention_head: usize,
        pool_size: usize,
        index: usize,
        vb: VarBuilder,
    ) -> Result<Self> {
        let vb = vb.pp(index);
        Ok(Self {
            norm1: nn::layer_norm(dim, 1e-6, vb.pp("norm1"))?,
            mixer: Mixer::new(dim, heads, attention_head, pool_size, vb.pp("attn"))?,
            norm2: nn::layer_norm(dim, 1e-6, vb.pp("norm2"))?,
            fc1: nn::linear(dim, dim * 4, vb.pp("mlp").pp("fc1"))?,
            fc2: nn::linear(dim * 4, dim, vb.pp("mlp").pp("fc2"))?,
            gamma1: vb.get(dim, "layer_scale_1")?,
            gamma2: vb.get(dim, "layer_scale_2")?,
        })
    }

    fn forward(&self, x: &Tensor) -> Result<Tensor> {
        let update = self.mixer.forward(&self.norm1.forward(x)?)?;
        let x = x.broadcast_add(&update.broadcast_mul(&self.gamma1)?)?;
        let update = self
            .fc2
            .forward(&self.fc1.forward(&self.norm2.forward(&x)?)?.gelu()?)?;
        x.broadcast_add(&update.broadcast_mul(&self.gamma2)?)
    }
}

pub struct DsNet {
    patch: FirstPatchEmbed,
    stages: Vec<Vec<Block>>,
    downsamples: Vec<ConvBn>,
    positions: Vec<Tensor>,
    norm: LayerNorm,
}

impl DsNet {
    pub fn load<P: AsRef<std::path::Path>>(checkpoint: P, device: &Device) -> Result<Self> {
        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[checkpoint], DType::F32, device)? }
            .pp("model");
        let patch = FirstPatchEmbed::new(vb.pp("patch_embed"))?;
        let mut positions = Vec::new();
        for (index, (dim, grid)) in DIMS.iter().zip([56, 28, 14, 7]).enumerate() {
            positions.push(vb.get((1, grid, grid, *dim), &format!("pos_embed{}", index + 1))?);
        }
        let mut stages = Vec::new();
        let mut block_index = 0;
        for stage in 0..4 {
            let mut blocks = Vec::new();
            for _ in 0..DEPTHS[stage] {
                let pool = if stage < 2 { 2 } else { 1 };
                blocks.push(Block::new(
                    DIMS[stage],
                    HEADS[stage],
                    ATTENTION_HEADS[block_index],
                    pool,
                    block_index,
                    vb.pp(format!("blocks{}", stage + 1)),
                )?);
                block_index += 1;
            }
            stages.push(blocks);
        }
        let downsamples = vec![
            ConvBn::new(96, 192, 3, 2, 1, 1, vb.pp("patch_embed2"))?,
            ConvBn::new(192, 320, 3, 2, 1, 1, vb.pp("patch_embed3"))?,
            ConvBn::new(320, 384, 3, 2, 1, 1, vb.pp("patch_embed4"))?,
        ];
        Ok(Self {
            patch,
            stages,
            downsamples,
            positions,
            norm: nn::layer_norm(384, 1e-6, vb.pp("norm"))?,
        })
    }

    pub fn embedding(&self, image: &Tensor) -> Result<Tensor> {
        let mut x = self.patch.forward(image)?;
        for stage in 0..4 {
            x = x.broadcast_add(&self.positions[stage])?;
            for block in &self.stages[stage] {
                x = block.forward(&x)?;
            }
            if stage < 3 {
                x = self.downsamples[stage]
                    .forward(&x.permute((0, 3, 1, 2))?)?
                    .permute((0, 2, 3, 1))?;
            }
        }
        self.norm.forward(&x)?.mean(1)
    }

    pub fn similarity(&self, left: &Tensor, right: &Tensor) -> Result<f32> {
        let left = self.embedding(left)?.flatten_all()?;
        let right = self.embedding(right)?.flatten_all()?;
        let dot = left.mul(&right)?.sum_all()?.to_scalar::<f32>()?;
        let left_norm = left.sqr()?.sum_all()?.to_scalar::<f32>()?.sqrt();
        let right_norm = right.sqr()?.sum_all()?.to_scalar::<f32>()?.sqrt();
        Ok((dot / (left_norm * right_norm).max(f32::EPSILON)).clamp(-1.0, 1.0))
    }
}
