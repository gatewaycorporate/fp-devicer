import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
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
if (!packageJson.files?.includes('dist')) throw new Error('The package must include dist for the NEXT export');
console.log(`NEXT release scope is valid for ${packageJson.name}@${packageJson.version}`);