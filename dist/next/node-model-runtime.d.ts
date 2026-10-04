import type { ModelInferenceContext, ModelRuntime } from './model-adapters.js';
export interface ProcessModelRuntimeOptions<TInput, TFeatures extends Record<string, unknown>> {
    command: string;
    args?: readonly string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    encode?(input: TInput): Record<string, unknown>;
    decode?(output: unknown): TFeatures;
}
/** JSON-lines bridge for application-owned Python, native, or worker runtimes. */
export declare class ProcessModelRuntime<TInput, TFeatures extends Record<string, unknown>> implements ModelRuntime<TInput, TFeatures> {
    private readonly options;
    private child?;
    private output?;
    private queue;
    private sequence;
    constructor(options: ProcessModelRuntimeOptions<TInput, TFeatures>);
    infer(input: TInput, context: ModelInferenceContext): Promise<TFeatures>;
    close(): Promise<void>;
    private run;
    private start;
    private readResponse;
}
//# sourceMappingURL=node-model-runtime.d.ts.map