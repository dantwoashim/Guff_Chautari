import type {
  ContextGathererOutput,
  EmotionalProcessorOutput,
  HumanizerOutput,
  IdentityResolverOutput,
  LearnerOutput,
  LLMCallerOutput,
  PipelineInput,
  PipelineStage,
  PromptBuilderOutput,
} from './types';
import { contextGatherer } from './stages/contextGatherer';
import { emotionalProcessor } from './stages/emotionalProcessor';
import { humanizer } from './stages/humanizer';
import { identityResolver } from './stages/identityResolver';
import { learner } from './stages/learner';
import { llmCaller } from './stages/llmCaller';
import { promptBuilder } from './stages/promptBuilder';

export interface PipelineOrchestratorStages {
  contextGatherer: PipelineStage<PipelineInput, ContextGathererOutput>;
  identityResolver: PipelineStage<ContextGathererOutput, IdentityResolverOutput>;
  emotionalProcessor: PipelineStage<IdentityResolverOutput, EmotionalProcessorOutput>;
  promptBuilder: PipelineStage<EmotionalProcessorOutput, PromptBuilderOutput>;
  llmCaller: PipelineStage<PromptBuilderOutput, LLMCallerOutput>;
  humanizer: PipelineStage<LLMCallerOutput, HumanizerOutput>;
  learner: PipelineStage<HumanizerOutput, LearnerOutput>;
}

export interface PipelineRunOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export class PipelineExecutionError extends Error {
  readonly stage: string;
  readonly causeValue: unknown;

  constructor(stage: string, causeValue: unknown, message?: string) {
    super(message ?? `Pipeline failed at stage ${stage}`);
    this.name = 'PipelineExecutionError';
    this.stage = stage;
    this.causeValue = causeValue;
  }
}

const defaultStages: PipelineOrchestratorStages = {
  contextGatherer,
  identityResolver,
  emotionalProcessor,
  promptBuilder,
  llmCaller,
  humanizer,
  learner,
};

const wait = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const isRetryable = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('temporarily unavailable') ||
    message.includes('429') ||
    message.includes('503')
  );
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new PipelineExecutionError('orchestrator', new Error('aborted'), 'Pipeline aborted by caller signal.');
  }
};

export class PipelineOrchestrator {
  private readonly stages: PipelineOrchestratorStages;

  constructor(stages: Partial<PipelineOrchestratorStages> = {}) {
    this.stages = {
      ...defaultStages,
      ...stages,
    };
  }

  async run(input: PipelineInput, options: PipelineRunOptions = {}): Promise<LearnerOutput> {
    const maxRetries = options.maxRetries ?? 1;
    const retryDelayMs = options.retryDelayMs ?? 120;

    throwIfAborted(input.abortSignal);

    const stage1 = await this.executeStage(this.stages.contextGatherer, input, 0, 0, input.abortSignal);
    const stage2 = await this.executeStage(this.stages.identityResolver, stage1, 0, 0, input.abortSignal);
    const stage3 = await this.executeStage(this.stages.emotionalProcessor, stage2, 0, 0, input.abortSignal);
    const stage4 = await this.executeStage(this.stages.promptBuilder, stage3, 0, 0, input.abortSignal);
    const stage5 = await this.executeStage(this.stages.llmCaller, stage4, maxRetries, retryDelayMs, input.abortSignal);
    const stage6 = await this.executeStage(this.stages.humanizer, stage5, 0, 0, input.abortSignal);
    const stage7 = await this.executeStage(this.stages.learner, stage6, 0, 0, input.abortSignal);

    return stage7;
  }

  private async executeStage<I, O>(
    stage: PipelineStage<I, O>,
    value: I,
    maxRetries: number,
    retryDelayMs: number,
    signal?: AbortSignal
  ): Promise<O> {
    let attempt = 0;

    while (true) {
      throwIfAborted(signal);

      try {
        return await stage.run(value);
      } catch (error) {
        throwIfAborted(signal);

        const canRetry = attempt < maxRetries && isRetryable(error);
        if (!canRetry) {
          throw new PipelineExecutionError(stage.name, error);
        }

        attempt += 1;
        await wait(retryDelayMs * attempt);
      }
    }
  }
}

export const createPipelineOrchestrator = (
  stages: Partial<PipelineOrchestratorStages> = {}
): PipelineOrchestrator => {
  return new PipelineOrchestrator(stages);
};
