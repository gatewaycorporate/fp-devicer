import { access, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertModelFreeFiles(files) {
  for (const { path, size = 0 } of files) {
    const name = path.replace(/^package\//, '');
    if (/(^|\/)(vendor\/models|models)(\/|$)/i.test(name)
      || /\.(onnx|pt|pth|ckpt|safetensors|tflite|h5|hdf5|pb|pkl|bin)$/i.test(name)
      || /(^|\/)(dsnet\.rs|convert-detailsemnet\.py|check-model-upstreams\.mjs|prepare-lfw-evaluation\.mjs)$/i.test(name)) {
      throw new Error(`Model-free release prohibits ${path}`);
    }
    if (/(^|\/)(dsnet|adaface|jipnet|cvlface|detailsemnet)([./_-]|$)/i.test(name)) {
      throw new Error(`Model-free release prohibits ${path}`);
    }
    if (size > 16 * 1024 * 1024) throw new Error(`Oversized release file requires review: ${path}`);
  }
}

export function packageInventory(output) {
  const parsed = JSON.parse(output);
  const packs = Array.isArray(parsed) ? parsed : Object.values(parsed);
  if (packs.length !== 1 || !Array.isArray(packs[0]?.files)) throw new Error('Expected one package inventory');
  return packs[0].files;
}

export async function checkRelease(root = resolve(import.meta.dirname, '..')) {
const requiredFiles = [
  'dist/next.js',
  'dist/next.d.ts',
  'dist/next/sqlite-storage.js',
  'dist/next/sqlite-storage.d.ts',
  'dist/next/postgres-storage.js',
  'dist/next/postgres-storage.d.ts',
  'dist/next/redis-storage.js',
  'dist/next/redis-storage.d.ts',
  'docs/next/rc-plan.md',
  'docs/next/charter.md',
  'docs/next/uncertainty.md',
  'docs/releases.md',
];
for (const file of requiredFiles) await access(resolve(root, file));

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const nextExport = packageJson.exports?.['./next'];
if (nextExport?.import !== './dist/next.js' || nextExport?.types !== './dist/next.d.ts') {
  throw new Error('The ./next package export is not configured for the built NEXT entry point');
}
for (const [subpath, runtime, types] of [
  ['./next/sqlite', './dist/next/sqlite-storage.js', './dist/next/sqlite-storage.d.ts'],
  ['./next/postgres', './dist/next/postgres-storage.js', './dist/next/postgres-storage.d.ts'],
  ['./next/redis', './dist/next/redis-storage.js', './dist/next/redis-storage.d.ts'],
]) {
  const exportEntry = packageJson.exports?.[subpath];
  if (exportEntry?.import !== runtime || exportEntry?.types !== types) {
    throw new Error(`The ${subpath} package export is not configured for its built NEXT entry point`);
  }
}
if (JSON.stringify(packageJson.files) !== JSON.stringify(['dist'])) throw new Error('The package must include only dist');
for (const [name, entry] of Object.entries(packageJson.exports)) {
  for (const target of Object.values(entry)) {
    if (typeof target !== 'string' || !target.startsWith('./dist/')) throw new Error(`Invalid export ${name}`);
    await access(resolve(root, target));
  }
}
if (/next:models:check|next:lfw:prepare|huggingface|hf_hub_download|convert-detailsemnet/i.test(JSON.stringify(packageJson.scripts))) {
  throw new Error('Model-specific package hooks are prohibited');
}
const cargo = await readFile(resolve(root, 'crates/devicer-compat-v2/Cargo.toml'), 'utf8');
if (/candle-runtime|candle-core|candle-nn/.test(cargo)) throw new Error('Production model runtime dependencies are prohibited');
const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const sourceFiles = [];
for (const entry of entries) {
  const [metadata, path] = entry.split('\t');
  if (metadata.startsWith('160000')) throw new Error(`Release must not contain a model/source submodule: ${path}`);
  try {
    const info = await stat(resolve(root, path));
    sourceFiles.push({ path, size: info.size });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
assertModelFreeFiles(sourceFiles);
const packedFiles = packageInventory(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
}));
assertModelFreeFiles(packedFiles);
const packedPaths = new Set(packedFiles.map(file => file.path));
for (const entry of Object.values(packageJson.exports)) {
  for (const target of Object.values(entry)) {
    if (!packedPaths.has(target.slice(2))) throw new Error(`Missing packed export ${target}`);
  }
}
console.log(`NEXT release scope is valid for ${packageJson.name}@${packageJson.version}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkRelease();