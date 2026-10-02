import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
/** JSON-lines bridge for application-owned Python, native, or worker runtimes. */
export class ProcessModelRuntime {
    options;
    child;
    output;
    queue = Promise.resolve();
    sequence = 0;
    constructor(options) {
        this.options = options;
    }
    infer(input, context) {
        const run = this.queue.then(() => this.run(input, context));
        this.queue = run.then(() => undefined, () => undefined);
        return run;
    }
    async close() {
        const child = this.child;
        this.child = undefined;
        this.output?.close();
        this.output = undefined;
        if (!child)
            return;
        child.kill();
    }
    async run(input, context) {
        if (context.signal?.aborted)
            throw new Error('Model inference was cancelled');
        await this.start();
        const requestId = context.requestId ?? `request-${++this.sequence}`;
        const child = this.child;
        if (!child?.stdin.writable)
            throw new Error('Model runtime is not writable');
        child.stdin.write(`${JSON.stringify({ requestId, input: this.options.encode?.(input) ?? input })}\n`);
        const output = await this.readResponse(requestId, context.signal);
        return this.options.decode ? this.options.decode(output) : output;
    }
    async start() {
        if (this.child)
            return;
        const child = spawn(this.options.command, [...(this.options.args ?? [])], {
            cwd: this.options.cwd,
            env: { ...process.env, ...this.options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child = child;
        this.output = createInterface({ input: child.stdout });
        child.once('exit', () => {
            if (this.child === child) {
                this.child = undefined;
                this.output?.close();
                this.output = undefined;
            }
        });
        child.once('error', () => {
            if (this.child === child)
                this.child = undefined;
        });
    }
    readResponse(requestId, signal) {
        const output = this.output;
        if (!output)
            return Promise.reject(new Error('Model runtime output is unavailable'));
        const timeoutMs = this.options.timeoutMs ?? 30_000;
        return new Promise((resolve, reject) => {
            let timer;
            const cleanup = () => {
                output.removeListener('line', onLine);
                signal?.removeEventListener('abort', onAbort);
                if (timer)
                    clearTimeout(timer);
            };
            const onLine = (line) => {
                let parsed;
                try {
                    parsed = JSON.parse(line);
                }
                catch (error) {
                    cleanup();
                    reject(new Error(`Model runtime returned invalid JSON: ${String(error)}`));
                    return;
                }
                if (parsed.requestId !== requestId)
                    return;
                cleanup();
                if (parsed.error)
                    reject(new Error(parsed.error));
                else
                    resolve(parsed.output);
            };
            const onAbort = () => {
                cleanup();
                reject(new Error('Model inference was cancelled'));
            };
            output.on('line', onLine);
            signal?.addEventListener('abort', onAbort, { once: true });
            timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Model runtime timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        });
    }
}
