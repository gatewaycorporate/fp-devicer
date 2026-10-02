import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const expected = [
  ['vendor/models/CVLface', '308142aa50adf2e187711354f7524635d3414f1e'],
  ['vendor/models/AdaFace', 'c60eaa786a42c03444f3df7096dbaf9d57ae010d'],
  ['vendor/models/JIPNet', '40d8445c5b3afa55b409ae3221377e54e3ace53f'],
  ['vendor/models/DetailSemNet', '0230f41e4454d9ec6274fc32b102e45c0b171ca9'],
];

for (const [relativePath, expectedCommit] of expected) {
  const repositoryPath = join(root, relativePath);
  if (!existsSync(repositoryPath)) throw new Error(`Missing model submodule: ${relativePath}`);
  const commit = execFileSync('git', ['-C', repositoryPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (commit !== expectedCommit) throw new Error(`${relativePath} is ${commit}, expected ${expectedCommit}`);
  if (!existsSync(join(repositoryPath, 'LICENSE'))) throw new Error(`Missing model license: ${relativePath}`);
}

const gitmodules = readFileSync(join(root, '.gitmodules'), 'utf8');
if (!gitmodules.includes('vendor/models/CVLface') || !gitmodules.includes('vendor/models/AdaFace') || !gitmodules.includes('vendor/models/JIPNet') || !gitmodules.includes('vendor/models/DetailSemNet')) {
  throw new Error('Model submodule registration is incomplete');
}

console.log('Model upstream submodules match pinned source commits and include licenses');
