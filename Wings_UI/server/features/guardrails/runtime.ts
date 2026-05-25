// Runtime guardrail policy — pre/post checks that wrap an LLM call.
// Pre-checks fire on user input (PII, prompt-injection); post-checks fire
// on LLM output (hallucination, toxicity, groundedness against context).

import {
  type EvalVerdict,
  type JudgeFn,
  runEvals,
} from "./engine.js";

export interface GuardrailPolicy {
  inputEvals: string[];   // evals to run on user input
  outputEvals: string[];  // evals to run on LLM output
  blockOnFail: boolean;   // refuse to return output if any check fails
}

export const DEFAULT_POLICY: GuardrailPolicy = {
  inputEvals: [],
  outputEvals: [],
  blockOnFail: false,
};

export const POLICY_PRESETS = {
  off: {
    inputEvals: [],
    outputEvals: [],
    blockOnFail: false,
  },
  basic: {
    inputEvals: ["prompt_injection"],
    outputEvals: ["toxicity", "pii"],
    blockOnFail: false,
  },
  rag: {
    inputEvals: ["prompt_injection"],
    outputEvals: ["detect_hallucination", "groundedness", "toxicity"],
    blockOnFail: true,
  },
  strict: {
    inputEvals: ["prompt_injection", "pii"],
    outputEvals: ["detect_hallucination", "groundedness", "toxicity", "bias_detection", "content_moderation"],
    blockOnFail: true,
  },
} satisfies Record<string, GuardrailPolicy>;

export interface PreCheckInput {
  userMessage: string;
  context?: string;
}

export interface PostCheckInput {
  userMessage: string;
  output: string;
  context?: string;
}

export interface GuardrailReport {
  stage: "pre" | "post";
  verdicts: EvalVerdict[];
  blocked: boolean;
  blockingEvals: string[];
}

export async function runPreChecks(
  policy: GuardrailPolicy,
  input: PreCheckInput,
  judge: JudgeFn,
): Promise<GuardrailReport> {
  if (policy.inputEvals.length === 0) {
    return { stage: "pre", verdicts: [], blocked: false, blockingEvals: [] };
  }
  const verdicts = await runEvals(
    policy.inputEvals,
    {
      values: {
        input: input.userMessage,
        output: input.userMessage, // some evals key on output even for input scans
        context: input.context || "",
      },
    },
    judge,
  );
  const blockingEvals = verdicts.filter((v) => v.passed === false).map((v) => v.evalId);
  return {
    stage: "pre",
    verdicts,
    blocked: policy.blockOnFail && blockingEvals.length > 0,
    blockingEvals,
  };
}

export async function runPostChecks(
  policy: GuardrailPolicy,
  input: PostCheckInput,
  judge: JudgeFn,
): Promise<GuardrailReport> {
  if (policy.outputEvals.length === 0) {
    return { stage: "post", verdicts: [], blocked: false, blockingEvals: [] };
  }
  const verdicts = await runEvals(
    policy.outputEvals,
    {
      values: {
        input: input.userMessage,
        output: input.output,
        context: input.context || "",
      },
    },
    judge,
  );
  const blockingEvals = verdicts.filter((v) => v.passed === false).map((v) => v.evalId);
  return {
    stage: "post",
    verdicts,
    blocked: policy.blockOnFail && blockingEvals.length > 0,
    blockingEvals,
  };
}

export function summarizeReport(report: GuardrailReport): string {
  if (report.verdicts.length === 0) return "no checks";
  const passed = report.verdicts.filter((v) => v.passed === true).length;
  const failed = report.verdicts.filter((v) => v.passed === false).length;
  const errored = report.verdicts.filter((v) => v.error).length;
  return `${report.stage}: ${passed} passed, ${failed} failed${errored ? `, ${errored} errored` : ""}`;
}
