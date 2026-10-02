#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createBrowserAdapter, createDocumentAdapter, compareFingerprints, createFingerprint } from '../dist/next.js';

function usage() {
  throw new Error('Usage: next-cli.mjs compare --domain <browser|document> --left <file> --right <file>');
}

const args = process.argv.slice(2);
if (args[0] !== 'compare') usage();
const value = name => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) usage();
  return args[index + 1];
};
const domain = value('--domain');
const adapter = domain === 'browser' ? createBrowserAdapter() : domain === 'document' ? createDocumentAdapter() : null;
if (!adapter) usage();
const left = JSON.parse(await readFile(value('--left'), 'utf8'));
const right = JSON.parse(await readFile(value('--right'), 'utf8'));
const leftObservation = await createFingerprint(adapter, left, { id: 'left' });
const rightObservation = await createFingerprint(adapter, right, { id: 'right' });
console.log(JSON.stringify(await compareFingerprints(adapter, leftObservation, rightObservation)));
