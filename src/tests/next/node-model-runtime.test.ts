import { describe, expect, it } from 'vitest';
import { ProcessModelRuntime } from '../../next/index.js';

const responder = `
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line) continue;
    const request = JSON.parse(line);
    process.stdout.write(JSON.stringify({ requestId: request.requestId, output: { value: request.input.value + 1 } }) + '\\n');
  }
});
`;

const delayedResponder = `
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop();
  for (const line of lines) {
    if (!line) continue;
    const request = JSON.parse(line);
    setTimeout(() => process.stdout.write(JSON.stringify({ requestId: request.requestId, output: { value: 1 } }) + '\\n'), 100);
  }
});
`;

function runtime(script: string, timeoutMs = 500): ProcessModelRuntime<{ value: number }, { value: number }> {
  return new ProcessModelRuntime({
    command: process.execPath,
    args: ['-e', script],
    timeoutMs,
    decode(output) {
      if (!output || typeof output !== 'object' || !('value' in output)) throw new Error('invalid feature output');
      return output as { value: number };
    },
  });
}

describe('ProcessModelRuntime', () => {
  it('round-trips typed inference through an external process', async () => {
    const model = runtime(responder);
    await expect(model.infer({ value: 4 }, { requestId: 'fixture-1' })).resolves.toEqual({ value: 5 });
    await model.close();
  });

  it('serializes requests and applies cancellation', async () => {
    const model = runtime(delayedResponder);
    const controller = new AbortController();
    const pending = model.infer({ value: 1 }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    await model.close();
  });

  it('bounds an unresponsive model process', async () => {
    const model = runtime('process.stdin.resume();', 10);
    await expect(model.infer({ value: 1 }, {})).rejects.toThrow('timed out');
    await model.close();
  });
});