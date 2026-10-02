import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const [datasetRoot, outputRoot = '/tmp/devicer-datasets/lfw/evaluation'] = process.argv.slice(2);
if (!datasetRoot) throw new Error('Usage: node scripts/prepare-lfw-evaluation.mjs <lfw/ directory> [output directory]');

const sourceDir = join(datasetRoot, 'lfw');
const subjects = (await readdir(sourceDir, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const observations = [];
for (const subject of subjects) {
  const files = (await readdir(join(sourceDir, subject))).filter(file => file.endsWith('.jpg')).sort();
  for (const file of files) {
    const path = join(sourceDir, subject, file);
    const digest = createHash('sha256').update(await readFile(path)).digest('hex');
    const pathId = createHash('sha256').update(`${subject}/${file}`).digest('hex');
    observations.push({
      id: `lfw_${pathId.slice(0, 24)}`,
      subject,
      path: relative(outputRoot, path),
      digest: `sha256:${digest}`,
    });
  }
}

const sourceDigest = `sha256:${createHash('sha256').update(observations.map(item => item.digest).join('\n')).digest('hex')}`;
const splitOf = subject => {
  const bucket = createHash('sha256').update(subject).digest()[0] % 10;
  return bucket < 6 ? 'calibration' : bucket < 8 ? 'held_out' : 'test';
};
const configDigest = 'sha256:unprovisioned-face-runtime';
const manifests = new Map();
for (const split of ['calibration', 'held_out', 'test']) {
  const selected = observations.filter(item => splitOf(item.subject) === split);
  manifests.set(split, {
    id: `lfw-${split}-v1`, domain: 'face', task: 'same-subject', split,
    sourceDigest, labelDigest: 'sha256:pair-labels-generated-v1',
    observationIds: selected.map(item => item.id),
    groups: Object.fromEntries(selected.map(item => [item.id, item.subject])),
    preprocessing: 'lfw-jpeg-reference-only.v1', modelConfigurationDigest: configDigest,
    dataset: 'Labeled Faces in the Wild', datasetSource: 'https://ndownloader.figshare.com/files/5976018',
    datasetArchiveDigest: 'sha256:055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0',
    status: 'structural-only-unprovisioned-model-runtime',
  });
}

const pairs = [];
for (const split of ['calibration', 'held_out', 'test']) {
  const selected = observations.filter(item => splitOf(item.subject) === split);
  const bySubject = new Map();
  for (const item of selected) bySubject.set(item.subject, [...(bySubject.get(item.subject) ?? []), item]);
  const selectedSubjects = [...bySubject.keys()].filter(subject => bySubject.get(subject).length >= 2);
  for (const subject of selectedSubjects.slice(0, 500)) {
    const items = bySubject.get(subject);
    pairs.push({ split, pairId: `${split}-genuine-${items[0].id}-${items[1].id}`, label: 1, group: subject, left: items[0], right: items[1] });
  }
  for (let index = 0; index < Math.min(500, selectedSubjects.length - 1); index += 1) {
    const left = bySubject.get(selectedSubjects[index])[0];
    const right = bySubject.get(selectedSubjects[index + 1])[0];
    pairs.push({ split, pairId: `${split}-impostor-${left.id}-${right.id}`, label: 0, group: `${left.subject}|${right.subject}`, left, right });
  }
}

await mkdir(outputRoot, { recursive: true });
await writeFile(join(outputRoot, 'observations.json'), JSON.stringify(observations, null, 2));
for (const [split, manifest] of manifests) await writeFile(join(outputRoot, `${split}.manifest.json`), JSON.stringify(manifest, null, 2));
await writeFile(join(outputRoot, 'pairs.jsonl'), `${pairs.map(pair => JSON.stringify(pair)).join('\n')}\n`);
console.log(JSON.stringify({ outputRoot, subjects: subjects.length, observations: observations.length, pairs: pairs.length, archiveSha256: '055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0' }, null, 2));