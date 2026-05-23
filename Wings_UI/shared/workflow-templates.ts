export type BranchName = "true" | "false";

export type WorkflowNodeKind =
  | "trigger"
  | "llm"
  | "code"
  | "tool"
  | "telegram"
  | "condition"
  | "loop"
  | "output";

export interface WorkflowNodeData {
  label: string;
  kind: WorkflowNodeKind;
  prompt?: string;
  model?: string;
  provider?: "primary" | "fallback";
  input?: string;
  code?: string;
  toolName?: string;
  toolArgs?: string;
  chatId?: string;
  condition?: string;
  itemsExpr?: string;
  bodyCode?: string;
  maxIterations?: number;
}

export interface WorkflowTemplateNode {
  id: string;
  type: WorkflowNodeKind;
  data: WorkflowNodeData;
  position?: { x: number; y: number };
}

export interface WorkflowTemplateEdge {
  id: string;
  source: string;
  target: string;
  branch?: BranchName;
}

export interface PersistedWorkflowRecord {
  id: string;
  name: string;
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
  updatedAt: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  defaultInput: string;
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
}

export function getStarterWorkflowRecords(): PersistedWorkflowRecord[] {
  return [
    {
      id: "starter-incident-triage",
      name: "Starter Incident Triage",
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          data: { label: "Input", kind: "trigger", input: "Describe the incident" },
          position: { x: 60, y: 120 },
        },
        {
          id: "llm-1",
          type: "llm",
          data: {
            label: "Triage",
            kind: "llm",
            prompt:
              "You are an incident operator. Summarize impact, likely cause, immediate mitigation, and next action.",
            model: "gpt-5.4",
            provider: "primary",
          },
          position: { x: 340, y: 120 },
        },
        {
          id: "output-1",
          type: "output",
          data: { label: "Result", kind: "output" },
          position: { x: 620, y: 120 },
        },
      ],
      edges: [
        { id: "edge-1", source: "trigger-1", target: "llm-1" },
        { id: "edge-2", source: "llm-1", target: "output-1" },
      ],
      updatedAt: new Date(0).toISOString(),
    },
  ];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "summarize-text",
    name: "Summarize Text",
    description: "Condense pasted text into decisions, risks, and next actions.",
    tags: ["llm", "summary"],
    defaultInput: "Paste meeting notes, logs, or a long message here.",
    nodes: [
      {
        id: "summary-trigger",
        type: "trigger",
        data: { label: "Text Input", kind: "trigger", input: "Paste text to summarize" },
        position: { x: 60, y: 120 },
      },
      {
        id: "summary-llm",
        type: "llm",
        data: {
          label: "Summarizer",
          kind: "llm",
          prompt:
            "Summarize the input into: 1. short summary, 2. key facts, 3. risks, 4. next actions. Keep it concise and operational.",
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 340, y: 120 },
      },
      {
        id: "summary-output",
        type: "output",
        data: { label: "Summary", kind: "output" },
        position: { x: 620, y: 120 },
      },
    ],
    edges: [
      { id: "summary-edge-1", source: "summary-trigger", target: "summary-llm" },
      { id: "summary-edge-2", source: "summary-llm", target: "summary-output" },
    ],
  },
  {
    id: "search-files-summary",
    name: "Search Files And Summarize",
    description: "Search guarded workspace files, then summarize the matching lines.",
    tags: ["tool", "files", "summary"],
    defaultInput: "memory",
    nodes: [
      {
        id: "search-trigger",
        type: "trigger",
        data: { label: "Search Query", kind: "trigger", input: "memory" },
        position: { x: 60, y: 150 },
      },
      {
        id: "search-tool",
        type: "tool",
        data: {
          label: "Search Files",
          kind: "tool",
          toolName: "search_files",
          toolArgs: "{ pattern: input }",
        },
        position: { x: 310, y: 150 },
      },
      {
        id: "search-llm",
        type: "llm",
        data: {
          label: "Summarize Matches",
          kind: "llm",
          prompt:
            "Summarize the file search result. Include the most relevant files, repeated themes, and recommended next inspection steps.",
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 590, y: 150 },
      },
      {
        id: "search-output",
        type: "output",
        data: { label: "Search Summary", kind: "output" },
        position: { x: 880, y: 150 },
      },
    ],
    edges: [
      { id: "search-edge-1", source: "search-trigger", target: "search-tool" },
      { id: "search-edge-2", source: "search-tool", target: "search-llm" },
      { id: "search-edge-3", source: "search-llm", target: "search-output" },
    ],
  },
  {
    id: "telegram-delivery",
    name: "Telegram Delivery",
    description: "Prepare an operator-safe message and deliver it to Telegram.",
    tags: ["telegram", "delivery"],
    defaultInput: "Deployment finished. Please verify the dashboard and note any errors.",
    nodes: [
      {
        id: "telegram-trigger",
        type: "trigger",
        data: {
          label: "Delivery Input",
          kind: "trigger",
          input: "Deployment finished. Please verify the dashboard.",
        },
        position: { x: 60, y: 120 },
      },
      {
        id: "telegram-llm",
        type: "llm",
        data: {
          label: "Prepare Message",
          kind: "llm",
          prompt:
            "Rewrite the input as a short Telegram operations update. Include status, requested action, and urgency.",
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 340, y: 120 },
      },
      {
        id: "telegram-send",
        type: "telegram",
        data: { label: "Send Telegram", kind: "telegram", chatId: "" },
        position: { x: 620, y: 120 },
      },
      {
        id: "telegram-output",
        type: "output",
        data: { label: "Delivery Result", kind: "output" },
        position: { x: 900, y: 120 },
      },
    ],
    edges: [
      { id: "telegram-edge-1", source: "telegram-trigger", target: "telegram-llm" },
      { id: "telegram-edge-2", source: "telegram-llm", target: "telegram-send" },
      { id: "telegram-edge-3", source: "telegram-send", target: "telegram-output" },
    ],
  },
  {
    id: "conditional-routing",
    name: "Conditional Routing",
    description: "Route urgent inputs to triage and non-urgent inputs to a lightweight response.",
    tags: ["condition", "routing"],
    defaultInput: "urgent: API latency is above threshold for checkout.",
    nodes: [
      {
        id: "condition-trigger",
        type: "trigger",
        data: { label: "Incoming Request", kind: "trigger", input: "urgent: API latency spike" },
        position: { x: 60, y: 200 },
      },
      {
        id: "condition-check",
        type: "condition",
        data: {
          label: "Urgent?",
          kind: "condition",
          condition: "/urgent|critical|down|outage/i.test(input)",
        },
        position: { x: 330, y: 200 },
      },
      {
        id: "condition-urgent",
        type: "llm",
        data: {
          label: "Incident Triage",
          kind: "llm",
          prompt:
            "Treat this as urgent. Return impact, immediate mitigation, owner, and next update time.",
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 610, y: 80 },
      },
      {
        id: "condition-normal",
        type: "llm",
        data: {
          label: "Standard Reply",
          kind: "llm",
          prompt:
            "Treat this as non-urgent. Return a concise response, recommended next step, and whether follow-up is needed.",
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 610, y: 310 },
      },
      {
        id: "condition-output",
        type: "output",
        data: { label: "Routed Output", kind: "output" },
        position: { x: 920, y: 200 },
      },
    ],
    edges: [
      { id: "condition-edge-1", source: "condition-trigger", target: "condition-check" },
      {
        id: "condition-edge-true",
        source: "condition-check",
        target: "condition-urgent",
        branch: "true",
      },
      {
        id: "condition-edge-false",
        source: "condition-check",
        target: "condition-normal",
        branch: "false",
      },
      { id: "condition-edge-2", source: "condition-urgent", target: "condition-output" },
      { id: "condition-edge-3", source: "condition-normal", target: "condition-output" },
    ],
  },
  {
    id: "loop-line-items",
    name: "Loop Over Line Items",
    description: "Transform each non-empty input line with a bounded deterministic loop.",
    tags: ["loop", "code"],
    defaultInput: "alpha\nbeta\ngamma",
    nodes: [
      {
        id: "loop-trigger",
        type: "trigger",
        data: { label: "Line Items", kind: "trigger", input: "alpha\nbeta\ngamma" },
        position: { x: 60, y: 120 },
      },
      {
        id: "loop-node",
        type: "loop",
        data: {
          label: "Normalize Items",
          kind: "loop",
          itemsExpr: "input.split('\\n').map((item) => item.trim()).filter(Boolean)",
          bodyCode:
            "return `${context.index + 1}/${context.total}: ${String(context.item).toUpperCase()}`;",
          maxIterations: 50,
        },
        position: { x: 350, y: 120 },
      },
      {
        id: "loop-output",
        type: "output",
        data: { label: "Loop Result", kind: "output" },
        position: { x: 650, y: 120 },
      },
    ],
    edges: [
      { id: "loop-edge-1", source: "loop-trigger", target: "loop-node" },
      { id: "loop-edge-2", source: "loop-node", target: "loop-output" },
    ],
  },
  {
    id: "line-reply-draft",
    name: "LINE Reply Draft",
    description: "Draft a safe LINE reply for a customer, partner, or community message without sending it automatically.",
    tags: ["line", "reply", "customer-support"],
    defaultInput:
      "Customer asks: Can you confirm my order status and delivery time? They also want to know if payment was received.",
    nodes: [
      {
        id: "line-reply-trigger",
        type: "trigger",
        data: {
          label: "Incoming LINE Message",
          kind: "trigger",
          input: "Paste the customer or community message here",
        },
        position: { x: 60, y: 120 },
      },
      {
        id: "line-reply-llm",
        type: "llm",
        data: {
          label: "Draft Reply",
          kind: "llm",
          prompt: [
            "Draft a LINE-ready reply for the message.",
            "Keep it warm, concise, and practical for a small operator.",
            "If the input is Thai, reply in Thai. Otherwise use the same language as the input.",
            "Do not claim a fact that is not in the input. Mark anything that needs human confirmation.",
            "Return: reply draft, missing facts, and next action.",
          ].join("\n"),
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 340, y: 120 },
      },
      {
        id: "line-reply-output",
        type: "output",
        data: { label: "Reply Draft", kind: "output" },
        position: { x: 660, y: 120 },
      },
    ],
    edges: [
      { id: "line-reply-edge-1", source: "line-reply-trigger", target: "line-reply-llm" },
      { id: "line-reply-edge-2", source: "line-reply-llm", target: "line-reply-output" },
    ],
  },
  {
    id: "small-shop-daily-brief",
    name: "Small Operator Daily Brief",
    description: "Turn scattered orders, messages, and tasks into a short owner action plan.",
    tags: ["operations", "small-business", "daily-brief"],
    defaultInput:
      "Orders: 3 pending payments, 2 delivery questions, 1 return request. Tasks: buy packaging, answer LINE, prepare tomorrow stock.",
    nodes: [
      {
        id: "small-brief-trigger",
        type: "trigger",
        data: {
          label: "Notes And Messages",
          kind: "trigger",
          input: "Paste today's orders, messages, and tasks",
        },
        position: { x: 60, y: 150 },
      },
      {
        id: "small-brief-llm",
        type: "llm",
        data: {
          label: "Owner Brief",
          kind: "llm",
          prompt: [
            "Create a daily brief for a small owner who needs more family time.",
            "Prioritize only the work that changes customer trust, cash flow, or tomorrow's readiness.",
            "Return: top 3 actions, replies to send, tasks to batch, tasks to postpone, and family-time cutoff.",
            "Keep it short enough to read in under one minute.",
          ].join("\n"),
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 350, y: 150 },
      },
      {
        id: "small-brief-output",
        type: "output",
        data: { label: "Daily Brief", kind: "output" },
        position: { x: 660, y: 150 },
      },
    ],
    edges: [
      { id: "small-brief-edge-1", source: "small-brief-trigger", target: "small-brief-llm" },
      { id: "small-brief-edge-2", source: "small-brief-llm", target: "small-brief-output" },
    ],
  },
  {
    id: "family-time-auto-triage",
    name: "Family Time Auto Triage",
    description: "Separate urgent work from safe-to-delay requests and produce a respectful reply plan.",
    tags: ["condition", "triage", "family-time"],
    defaultInput: "Customer says the parcel may be lost and asks for help before tonight.",
    nodes: [
      {
        id: "family-triage-trigger",
        type: "trigger",
        data: {
          label: "Incoming Request",
          kind: "trigger",
          input: "Paste a work request that arrived near family time",
        },
        position: { x: 60, y: 210 },
      },
      {
        id: "family-triage-check",
        type: "condition",
        data: {
          label: "Needs Same-Day Action?",
          kind: "condition",
          condition:
            "/urgent|lost|payment|refund|angry|complaint|today|tonight|broken|cannot|missing/i.test(input)",
        },
        position: { x: 360, y: 210 },
      },
      {
        id: "family-triage-urgent",
        type: "llm",
        data: {
          label: "Same-Day Plan",
          kind: "llm",
          prompt: [
            "Treat this as same-day work.",
            "Return the smallest action that protects trust, a short reply draft, and what can wait until tomorrow.",
          ].join("\n"),
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 680, y: 80 },
      },
      {
        id: "family-triage-later",
        type: "llm",
        data: {
          label: "Defer Safely",
          kind: "llm",
          prompt: [
            "Treat this as safe to defer.",
            "Return a polite reply draft, a scheduled next step, and a one-line note for tomorrow's task list.",
          ].join("\n"),
          model: "gpt-4o-mini",
          provider: "primary",
        },
        position: { x: 680, y: 340 },
      },
      {
        id: "family-triage-output",
        type: "output",
        data: { label: "Triage Result", kind: "output" },
        position: { x: 1010, y: 210 },
      },
    ],
    edges: [
      { id: "family-triage-edge-1", source: "family-triage-trigger", target: "family-triage-check" },
      {
        id: "family-triage-edge-true",
        source: "family-triage-check",
        target: "family-triage-urgent",
        branch: "true",
      },
      {
        id: "family-triage-edge-false",
        source: "family-triage-check",
        target: "family-triage-later",
        branch: "false",
      },
      { id: "family-triage-edge-2", source: "family-triage-urgent", target: "family-triage-output" },
      { id: "family-triage-edge-3", source: "family-triage-later", target: "family-triage-output" },
    ],
  },
];
