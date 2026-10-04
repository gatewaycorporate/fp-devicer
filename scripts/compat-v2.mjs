import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), '..');
const baseline = {
  package: 'devicer.js',
  version: '2.0.3',
  commit: '62572742c9a1d920d9f91dbbb7f5dd3c38bd0fb8',
  url: 'https://registry.npmjs.org/devicer.js/-/devicer.js-2.0.3.tgz',
  integrity: 'sha512-CKpAy7nOw9s9rXaw3VvxGKEPO0hHIB+sRi9qCYRGLCwvFxQ7GTh1HfqWWukcS0rWozqrVm3ZLwbdYDLeVGknGw==',
};

const sample = {
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  language: 'en-US',
  languages: ['en-US', 'fr-FR'],
  platform: 'Linux x86_64',
  hardwareConcurrency: 8,
  deviceMemory: 16,
  screen: { width: 1920, height: 1080, colorDepth: 24, pixelDepth: 24 },
  timezone: 'Europe/Paris',
  fonts: ['Arial', 'Courier New', 'DejaVu Sans', 'Times New Roman'],
  canvas: Array.from({ length: 32 }, (_, index) => createHash('sha256').update(`compat-canvas-${index}`).digest('hex')).join(''),
  webgl: { vendor: 'Mesa', renderer: 'Intel UHD Graphics 620' },
};

function capture(operation) {
  try {
    return { value: operation() };
  } catch (error) {
    return { error: { name: error.name, message: error.message } };
  }
}

function score(api, left, right, options) {
  return {
    confidence: capture(() => api.createConfidenceCalculator(options).calculateConfidence(left, right)),
    breakdown: capture(() => api.calculateScoreBreakdown(left, right, options)),
  };
}

const cases = {
  hashes(api) {
    const inputs = [undefined, null, '', 'abc', 'a'.repeat(512), sample,
      { ...sample, number: 1 }, { ...sample, number: '1' },
      { ...sample, unicode: '\u00e9\ud83d\ude00\ud800' },
      { ...sample, array: [undefined, null, 1, '1'] },
      Object.fromEntries(Object.entries(sample).reverse())];
    return inputs.map(input => capture(() => api.getHash(input)));
  },
  hashDistance(api) {
    const first = api.getHash(sample);
    const second = api.getHash({ ...sample, language: 'de-DE', hardwareConcurrency: 4 });
    return [capture(() => api.compareHashes(first, first)),
      capture(() => api.compareHashes(first, second)),
      capture(() => api.compareHashes('', 'invalid'))];
  },
  scores(api) {
    return [score(api, sample, sample),
      score(api, sample, { ...sample, language: 'de-DE', hardwareConcurrency: 4 }),
      score(api, {}, {}), score(api, null, undefined),
      score(api, { text: 'a'.repeat(512) }, { text: 'a'.repeat(512) }),
      score(api, { ...sample, optional: undefined }, { ...sample, optional: null }),
      score(api, { ...sample, date: new Date('2020-01-01T00:00:00Z') },
        { ...sample, date: new Date('2021-01-01T00:00:00Z') }),
      score(api, { ...sample, behavioralMetrics: { marker: 1 } },
        { ...sample, behavioralMetrics: { marker: 999 } })];
  },
  registry(api) {
    const calculator = api.createConfidenceCalculator();
    const other = { ...sample, userAgent: 'Different browser', fonts: ['Other'] };
    api.registerComparator('userAgent', () => 0.25);
    const beforeFirstUse = calculator.calculateScoreBreakdown(sample, other);
    api.registerComparator('userAgent', () => 0.75);
    const afterFirstUse = calculator.calculateScoreBreakdown(sample, other);
    api.clearRegistry();
    const afterClear = calculator.calculateScoreBreakdown(sample, other);
    api.initializeDefaultRegistry();
    const afterInitialize = calculator.calculateScoreBreakdown(sample, other);
    return { beforeFirstUse, afterFirstUse, afterClear, afterInitialize,
      missingComparator: api.unregisterComparator('absent'),
      missingWeight: api.unregisterWeight('absent'),
      invalidComparator: capture(() => api.registerComparator('field', null)),
      invalidWeight: capture(() => api.registerWeight('field', -1)) };
  },
  callbacks(api) {
    const left = { ...sample, custom: { marker: 'left' } };
    const right = { ...sample, custom: { marker: 'right' } };
    const calls = [];
    api.calculateConfidence(sample, sample);
    api.registerComparator('custom', (first, second) => {
      calls.push({ firstIsOriginal: first === left.custom, secondIsOriginal: second === right.custom });
      return 0.375;
    });
    const result = score(api, left, right);
    api.registerComparator('custom', () => { throw new Error('compat callback failure'); });
    const thrown = score(api, left, right);
    return { result, calls, thrown };
  },
  helpers(api) {
    return {
      decayAtZero: api.computeTemporalDecayFactor(0),
      decayAtParameter: api.computeTemporalDecayFactor(api.DEFAULT_DECAY_HALF_LIFE_MS),
      emptyGraphJaccard: api.jaccardSimilarity([], []),
      graphJaccard: api.jaccardSimilarity(['a', 'b'], ['b', 'c']),
      subnet: api.subnetKey('192.168.1.123'),
      weights: api.DEFAULT_WEIGHTS,
      decayParameter: api.DEFAULT_DECAY_HALF_LIFE_MS,
    };
  },
};

function declarationManifest(entry) {
  let roots = [entry];
  if (entry === resolve(root, 'src/main.ts')) {
    const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
    assert.equal(config.error, undefined, 'Cannot read project TypeScript configuration');
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    assert.equal(parsed.errors.length, 0, 'Invalid project TypeScript configuration');
    roots = parsed.fileNames;
  }
  const program = ts.createProgram(roots, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  assert.ok(source, `Missing declaration entry: ${entry}`);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  const formatFlags = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;
  const printer = ts.createPrinter({ removeComments: true });
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
  const describe = type => ({
    type: checker.typeToString(type, source, formatFlags),
    calls: type.getCallSignatures().map(signature => checker.signatureToString(signature, source, formatFlags)),
    indices: checker.getIndexInfosOfType(type).map(info => ({
      key: checker.typeToString(info.keyType, source, formatFlags),
      value: checker.typeToString(info.type, source, formatFlags),
      readonly: info.isReadonly,
    })),
    members: type.getProperties().filter(member => !member.declarations?.some(declaration =>
      ts.getCombinedModifierFlags(declaration) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)
    )).map(member => ({
      name: checker.symbolToString(member),
      optional: Boolean(member.flags & ts.SymbolFlags.Optional),
      type: checker.typeToString(checker.getTypeOfSymbolAtLocation(member, source), source, formatFlags),
    })).sort((left, right) => left.name.localeCompare(right.name, 'en')),
  });
  return checker.getExportsOfModule(checker.getSymbolAtLocation(source)).map(exported => {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const entry = {
      name: exported.name,
      typeParameters: (symbol.declarations ?? []).flatMap(declaration =>
        (declaration.typeParameters ?? []).map(print)),
      aliases: (symbol.declarations ?? []).filter(ts.isTypeAliasDeclaration).map(declaration => print(declaration.type)),
    };
    if (symbol.flags & ts.SymbolFlags.Value) {
      const value = checker.getTypeOfSymbolAtLocation(symbol, source);
      entry.value = describe(value);
      entry.constructors = value.getConstructSignatures().map(signature => checker.signatureToString(signature, source, formatFlags));
    }
    if (symbol.flags & ts.SymbolFlags.Type) entry.declared = describe(checker.getDeclaredTypeOfSymbol(symbol));
    return entry;
  }).sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

async function oracleDirectory() {
  const cache = resolve(root, '.compat-cache');
  await mkdir(cache, { recursive: true });
  const archive = resolve(cache, 'devicer.js-2.0.3.tgz');
  let bytes;
  try {
    bytes = await readFile(archive);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(baseline.url);
    assert.ok(response.ok, `Oracle download failed: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  assert.equal(integrity, baseline.integrity, 'Published oracle integrity mismatch');
  await writeFile(archive, bytes);
  const directory = resolve(cache, 'oracle');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  return resolve(directory, 'package');
}

async function snapshot(directory) {
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const entry = resolve(directory, metadata.main);
  const runtime = JSON.parse(execFileSync(process.execPath, [script, '--worker', entry, 'exports'], { encoding: 'utf8' }));
  const behavior = {};
  for (const name of Object.keys(cases)) {
    behavior[name] = JSON.parse(execFileSync(process.execPath, [script, '--worker', entry, name], { encoding: 'utf8' }));
  }
  return {
    package: {
      type: metadata.type,
      main: metadata.main,
      types: metadata.types,
      exports: metadata.exports && Object.prototype.hasOwnProperty.call(metadata.exports, '.')
        ? { '.': metadata.exports['.'] }
        : metadata.exports,
    },
    runtime,
    declarations: declarationManifest(resolve(directory, metadata.types)),
    behavior,
    consumer: await runConsumer(directory),
  };
}

async function runConsumer(directory) {
  const sandbox = await mkdtemp(resolve(root, '.compat-cache/consumer-'));
  try {
    await mkdir(resolve(sandbox, 'node_modules'));
    await writeFile(resolve(sandbox, 'package.json'), JSON.stringify({ name: 'compat-consumer', type: 'module' }));
    await symlink(directory, resolve(sandbox, 'node_modules/devicer.js'), 'junction');
    const entry = resolve(sandbox, 'consumer.ts');
    await copyFile(resolve(root, 'tests/compat/consumer.ts'), entry);
    const program = ts.createProgram([entry], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      noEmitOnError: true,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: name => name,
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
    }));
    assert.equal(program.emit().emitSkipped, false, 'Consumer compilation failed');
    return JSON.parse(execFileSync(process.execPath, [resolve(sandbox, 'consumer.js')], {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, NEXT_COMPAT_SAMPLE: JSON.stringify(sample) },
    }));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function packagedCandidate() {
  const cache = resolve(root, '.compat-cache');
  const build = resolve(cache, 'build');
  const packed = resolve(cache, 'packed');
  await rm(build, { recursive: true, force: true });
  await rm(packed, { recursive: true, force: true });
  await mkdir(build, { recursive: true });
  await mkdir(packed, { recursive: true });
  execFileSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'),
    '--project', resolve(root, 'tsconfig.json'), '--outDir', resolve(build, 'dist')], { stdio: 'inherit' });
  for (const filename of ['package.json', 'README.md', 'license.txt']) {
    await copyFile(resolve(root, filename), resolve(build, filename));
  }
  const output = JSON.parse(execFileSync('npm', ['pack', build, '--json', '--ignore-scripts', '--pack-destination', packed], {
    cwd: root,
    encoding: 'utf8',
  }));
  const packages = Array.isArray(output) ? output : Object.values(output);
  assert.equal(packages.length, 1, 'Expected one packed candidate');
  execFileSync('tar', ['-xzf', resolve(packed, packages[0].filename), '-C', packed]);
  return resolve(packed, 'package');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--worker') {
    const api = await import(pathToFileURL(args[1]).href);
    console.error = () => {};
    console.warn = () => {};
    const result = args[2] === 'exports'
      ? Object.keys(api).sort().map(name => ({ name, type: typeof api[name] }))
      : cases[args[2]](api);
    process.stdout.write(JSON.stringify(result));
    return;
  }
  assert.ok(args.length === 0 || (args.length === 1 && ['--record', '--pack'].includes(args[0])) ||
    (args.length === 2 && args[0] === '--candidate'), 'Usage: compat-v2.mjs [--record | --pack | --candidate <package-directory>]');
  const oracle = await oracleDirectory();
  const reference = { baseline, snapshot: await snapshot(oracle) };
  const fixture = resolve(root, 'tests/compat/v2.0.3.json');
  if (args[0] === '--record') {
    await mkdir(dirname(fixture), { recursive: true });
    await writeFile(fixture, `${JSON.stringify(reference, null, 2)}\n`);
    console.log('Recorded published 2.0.3 oracle; review the fixture diff before accepting it.');
    return;
  }
  assert.deepStrictEqual(reference, JSON.parse(await readFile(fixture, 'utf8')), 'Published oracle differs from frozen fixture');
  const candidate = args[0] === '--pack' ? await packagedCandidate()
    : args[0] === '--candidate' ? resolve(args[1]) : root;
  assert.deepStrictEqual(await snapshot(candidate), reference.snapshot, 'Candidate differs from published 2.0.3');
  if (candidate === root || args[0] === '--pack') {
    assert.deepStrictEqual(declarationManifest(resolve(root, 'src/main.ts')), reference.snapshot.declarations,
      'Source API differs from published declarations');
  }
  console.log(`Compatibility passed: ${reference.snapshot.runtime.length} runtime exports, ${reference.snapshot.declarations.length} declarations, ${Object.keys(cases).length} isolated case groups.`);
}

await main();