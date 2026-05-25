import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { nanoid } from "nanoid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Brain,
  Clock3,
  GitBranchPlus,
  Layers3,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { api, type ExecutionRecord, type MemoryEntry, type TokenUsage, type ToolDefinition } from "@/lib/api";
import {
  WORKFLOW_TEMPLATES,
  type BranchName,
  type PersistedWorkflowRecord as PersistedWorkflow,
  type WorkflowNodeData as WNodeData,
  type WorkflowNodeKind as NodeKind,
} from "@shared/workflow-templates";
import { toast } from "sonner";

const KIND_LABEL: Record<NodeKind, string> = {
  trigger: "Trigger",
  llm: "LLM",
  code: "Code",
  output: "Output",
  tool: "Tool",
  telegram: "Send Telegram",
  condition: "Condition",
  loop: "Loop",
};

const KIND_COLOR: Record<NodeKind, string> = {
  trigger: "bg-emerald-500",
  llm: "bg-violet-500",
  code: "bg-amber-500",
  output: "bg-sky-500",
  tool: "bg-pink-500",
  telegram: "bg-sky-600",
  condition: "bg-orange-500",
  loop: "bg-cyan-600",
};

const DEFAULT_WORKFLOW_ID = "default";
const DEFAULT_WORKFLOW_NAME = "Main workflow";

function WNode({ data, selected }: { data: WNodeData; selected: boolean }) {
  const hasIn = data.kind !== "trigger";
  const hasOut = data.kind !== "output";
  return (
    <div
      className={`rounded-lg border bg-card shadow-sm text-sm min-w-[180px] ${selected ? "ring-2 ring-primary" : ""}`}
    >
      {hasIn && <Handle type="target" position={Position.Left} />}
      <div
        className={`${KIND_COLOR[data.kind]} rounded-t-lg px-3 py-1.5 text-white text-xs font-semibold flex items-center justify-between`}
      >
        <span>{KIND_LABEL[data.kind]}</span>
      </div>
      <div className="px-3 py-2">
        <div className="font-medium">{data.label}</div>
        {data.kind === "llm" && data.model && (
          <div className="text-xs text-muted-foreground mt-1">{data.model}</div>
        )}
        {data.kind === "llm" && (
          <div className="text-[11px] text-muted-foreground mt-1">
            provider: {data.provider || "primary"}
          </div>
        )}
        {data.kind === "trigger" && data.input && (
          <div className="text-xs text-muted-foreground mt-1 truncate max-w-[160px]">
            {data.input}
          </div>
        )}
        {data.kind === "tool" && data.toolName && (
          <div className="text-xs text-muted-foreground mt-1 font-mono">
            {data.toolName}
          </div>
        )}
      </div>
      {hasOut && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

const nodeTypes: NodeTypes = { wnode: WNode };

const initialNodes: Node<WNodeData>[] = [
  {
    id: "t1",
    type: "wnode",
    position: { x: 60, y: 120 },
    data: { label: "Input", kind: "trigger", input: "Hello from Wings Of World" },
  },
  {
    id: "l1",
    type: "wnode",
    position: { x: 340, y: 120 },
    data: {
      label: "ChatGPT",
      kind: "llm",
      prompt: "You are a helpful assistant. Respond concisely.",
      model: "gpt-4o-mini",
    },
  },
  {
    id: "o1",
    type: "wnode",
    position: { x: 620, y: 120 },
    data: { label: "Result", kind: "output" },
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "t1", target: "l1" },
  { id: "e2", source: "l1", target: "o1" },
];

function buildWorkflowPayload(nodes: Node<WNodeData>[], edges: Edge[]) {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.kind,
      data: node.data,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      branch: ((edge.data as { branch?: BranchName } | undefined)?.branch),
    })),
  };
}

function validateWorkflow(nodes: Node<WNodeData>[], edges: Edge[]) {
  const errors: string[] = [];

  if (nodes.length === 0) errors.push("Add at least one node before running.");
  if (!nodes.some((node) => node.data.kind === "trigger")) {
    errors.push("Workflow needs at least one trigger node.");
  }
  if (!nodes.some((node) => node.data.kind === "output")) {
    errors.push("Workflow needs at least one output node.");
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      errors.push("Workflow contains an edge pointing to a missing node.");
      break;
    }
  }

  for (const node of nodes) {
    if (node.data.kind === "condition" && !node.data.condition?.trim()) {
      errors.push(`Condition node "${node.data.label}" needs an expression.`);
    }
    if (node.data.kind === "loop") {
      if (!node.data.itemsExpr?.trim()) {
        errors.push(`Loop node "${node.data.label}" needs an items expression.`);
      }
      if (!node.data.bodyCode?.trim()) {
        errors.push(`Loop node "${node.data.label}" needs body code.`);
      }
    }
  }

  return errors;
}

function materializeWorkflowEdges(edges: PersistedWorkflow["edges"]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.branch ? edge.branch : undefined,
    data: edge.branch ? { branch: edge.branch } : undefined,
  }));
}

function materializeWorkflowNodes(
  nodes: PersistedWorkflow["nodes"],
): Node<WNodeData>[] {
  return nodes.map((node, index) => ({
    id: node.id,
    type: "wnode",
    position: node.position || { x: 120 + index * 220, y: 120 },
    data: { ...node.data },
  }));
}

function cloneInitialNodes(): Node<WNodeData>[] {
  return initialNodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...node.data },
  }));
}

function cloneInitialEdges(): Edge[] {
  return initialEdges.map((edge) => ({ ...edge }));
}

function buildWorkflowRecord(
  id: string,
  name: string,
  nodes: Node<WNodeData>[],
  edges: Edge[],
): PersistedWorkflow {
  const payload = buildWorkflowPayload(nodes, edges);
  return {
    id,
    name: name.trim() || DEFAULT_WORKFLOW_NAME,
    nodes: payload.nodes,
    edges: payload.edges,
    updatedAt: new Date().toISOString(),
  };
}

function serializeWorkflowState(
  id: string,
  name: string,
  nodes: Node<WNodeData>[],
  edges: Edge[],
) {
  const payload = buildWorkflowPayload(nodes, edges);
  return JSON.stringify({
    id,
    name: name.trim() || DEFAULT_WORKFLOW_NAME,
    nodes: payload.nodes,
    edges: payload.edges,
  });
}

function summarizeWorkflowRecord(record: {
  nodes: Array<{ data: WNodeData }>;
  edges: Array<{ id: string }>;
}) {
  const llmNodes = record.nodes.filter((node) => node.data.kind === "llm").length;
  const outputs = record.nodes.filter((node) => node.data.kind === "output").length;
  return {
    nodeCount: record.nodes.length,
    edgeCount: record.edges.length,
    llmNodes,
    outputs,
  };
}

function getNodeInspectorHint(kind: NodeKind) {
  switch (kind) {
    case "trigger":
      return "Use trigger nodes for the operator input that starts the flow. Keep the starting text short and intentional.";
    case "llm":
      return "Use LLM nodes for reasoning or generation. Keep the prompt scoped to one job and only switch to fallback when you truly need a backup lane.";
    case "code":
      return "Use code nodes for deterministic transforms or formatting. Keep them narrow so the graph stays debuggable.";
    case "tool":
      return "Use tool nodes for registered Wings Of World capabilities. Pick a tool from the registry when possible, then keep arguments explicit.";
    case "telegram":
      return "Use Telegram nodes to deliver the current input to a linked chat or an explicit chat id.";
    case "condition":
      return "Use condition nodes to choose a true or false path. Incoming text is available as input; previous outputs are available as context.outputs.";
    case "loop":
      return "Use loop nodes to run a small deterministic transform over a bounded list. Items are available as context.item with context.index and context.total.";
    case "output":
      return "Use output nodes for the final surfaced result. Keep them near the end of the graph so trace reading stays clear.";
    default:
      return "";
  }
}

export default function WorkflowPage() {
  const formatTokenUsage = (usage?: TokenUsage | null) => {
    if (!usage || !usage.totalTokens) return "0 tokens";
    return `${usage.totalTokens} tokens`;
  };
  const formatCost = (value?: number | null) => `$${Number(value || 0).toFixed(6)}`;
  const formatDateTime = (value?: string | null) => {
    if (!value) return "Not saved yet";
    return new Date(value).toLocaleString();
  };

  const [location] = useLocation();
  const [nodes, setNodes, onNodesChange] = useNodesState<WNodeData>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [workflowLibrary, setWorkflowLibrary] = useState<PersistedWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState(DEFAULT_WORKFLOW_ID);
  const [workflowName, setWorkflowName] = useState(DEFAULT_WORKFLOW_NAME);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState(
    serializeWorkflowState(
      DEFAULT_WORKFLOW_ID,
      DEFAULT_WORKFLOW_NAME,
      initialNodes,
      initialEdges,
    ),
  );
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [trace, setTrace] = useState<string[]>([]);
  const [memoryContext, setMemoryContext] = useState<MemoryEntry[]>([]);
  const [savingOutputToMemory, setSavingOutputToMemory] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([]);
  const [replayRunId, setReplayRunId] = useState<string | null>(null);
  const [workflowUsage, setWorkflowUsage] = useState<TokenUsage | null>(null);
  const [workflowCost, setWorkflowCost] = useState(0);
  const [nodeUsage, setNodeUsage] = useState<
    Array<{ nodeId: string; label: string; provider: string; model: string; usage: TokenUsage }>
  >([]);
  const [providerHealth, setProviderHealth] = useState<any>(null);
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(WORKFLOW_TEMPLATES[0]?.id || "");

  const selected = nodes.find((node) => node.id === selectedId) || null;
  const selectedOutgoingEdges = selected
    ? edges.filter((edge) => edge.source === selected.id)
    : [];
  const fallbackSelected =
    selected?.data.kind === "llm" && (selected.data.provider || "primary") === "fallback";
  const fallbackWarning = fallbackSelected
    ? !providerHealth?.fallback?.enabled
      ? "Fallback lane is selected, but fallback is disabled in Settings."
      : !providerHealth?.fallback?.configured
        ? "Fallback lane is selected, but the fallback provider is not fully configured."
        : ""
    : "";
  const isDirty =
    serializeWorkflowState(activeWorkflowId, workflowName, nodes, edges) !==
    lastSavedSnapshot;
  const validationErrors = useMemo(() => validateWorkflow(nodes, edges), [nodes, edges]);
  const activeSavedWorkflow = useMemo(
    () => workflowLibrary.find((item) => item.id === activeWorkflowId) || null,
    [workflowLibrary, activeWorkflowId],
  );
  const activeWorkflowStateLabel = activeSavedWorkflow
    ? isDirty
      ? "Diverged draft"
      : "Saved snapshot"
    : "Unsaved draft";
  const activeWorkflowStateDetail = activeSavedWorkflow
    ? isDirty
      ? "The canvas started from a saved workflow but now contains local changes."
      : "The canvas matches the latest saved version in the library."
    : "The canvas exists only in the editor until you save it into the library.";
  const canvasSummary = useMemo(
    () =>
      summarizeWorkflowRecord({
        nodes: nodes.map((node) => ({ data: node.data })),
        edges: edges.map((edge) => ({ id: edge.id })),
      }),
    [nodes, edges],
  );
  const readyToRun = validationErrors.length === 0;

  useEffect(() => {
    let cancelled = false;

    api.listWorkflows()
      .then((list: PersistedWorkflow[]) => {
        if (cancelled) return;
        if (!Array.isArray(list) || list.length === 0) {
          setNodes(cloneInitialNodes());
          setEdges(cloneInitialEdges());
          setWorkflowLibrary([]);
          setActiveWorkflowId(DEFAULT_WORKFLOW_ID);
          setWorkflowName(DEFAULT_WORKFLOW_NAME);
          setSavedAt(null);
          setLastSavedSnapshot("");
          return;
        }

        const saved = list.find((item) => item?.id === DEFAULT_WORKFLOW_ID) || list[0];
        if (!saved?.nodes || !saved?.edges) return;

        setWorkflowLibrary(list);
        setActiveWorkflowId(saved.id);
        setWorkflowName(saved.name || DEFAULT_WORKFLOW_NAME);
        setNodes(materializeWorkflowNodes(saved.nodes));
        const nextEdges = materializeWorkflowEdges(saved.edges);
        setEdges(nextEdges);
        setSavedAt(saved.updatedAt || null);
        setLastSavedSnapshot(
          serializeWorkflowState(
            saved.id,
            saved.name || DEFAULT_WORKFLOW_NAME,
            materializeWorkflowNodes(saved.nodes),
            nextEdges,
          ),
        );
      })
      .catch((err: Error) => {
        if (!cancelled) {
          toast.error(`Load workflow failed: ${err.message}`);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setEdges, setNodes]);

  useEffect(() => {
    api.getSystemHealth().then((data) => setProviderHealth(data.provider)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingTools(true);
    api.getTools()
      .then((data) => setTools(Array.isArray(data.tools) ? data.tools : []))
      .catch(() => setTools([]))
      .finally(() => setLoadingTools(false));
  }, []);

  useEffect(() => {
    api.listExecutions({
      kind: "workflow",
      targetId: activeWorkflowId || undefined,
      limit: 12,
    }).then((data) => setExecutionHistory(data.entries)).catch(() => {});
  }, [activeWorkflowId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextInput = params.get("input");
    const workflowId = params.get("workflowId");
    const replay = params.get("replay");
    if (nextInput) {
      setInput(nextInput);
    }
    if (workflowId) {
      const match = workflowLibrary.find((entry) => entry.id === workflowId);
      if (match) {
        applyWorkflowRecord(match);
      }
    }
    setReplayRunId(replay);
  }, [location, workflowLibrary]);

  const applyWorkflowRecord = (record: PersistedWorkflow) => {
    const nextNodes = materializeWorkflowNodes(record.nodes);
    const nextEdges = materializeWorkflowEdges(record.edges);
    setActiveWorkflowId(record.id);
    setWorkflowName(record.name || DEFAULT_WORKFLOW_NAME);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedId(null);
    setOutputs({});
    setTrace([]);
    setMemoryContext([]);
    setWorkflowUsage(null);
    setWorkflowCost(0);
    setNodeUsage([]);
    setSavedAt(record.updatedAt || null);
    setLastSavedSnapshot(
      serializeWorkflowState(
        record.id,
        record.name || DEFAULT_WORKFLOW_NAME,
        nextNodes,
        nextEdges,
      ),
    );
  };

  const createStarterWorkflow = () => {
    if (isDirty && !window.confirm("Discard unsaved workflow changes and start a new starter workflow?")) {
      return;
    }
    setActiveWorkflowId(nanoid(8));
    setWorkflowName(`Workflow ${workflowLibrary.length + 1}`);
    setNodes(cloneInitialNodes());
    setEdges(cloneInitialEdges());
    setSelectedId(null);
    setOutputs({});
    setTrace([]);
    setMemoryContext([]);
    setSavedAt(null);
    setLastSavedSnapshot("");
    toast.success("New starter workflow ready");
  };

  const loadWorkflowRecord = (record: PersistedWorkflow) => {
    if (
      record.id !== activeWorkflowId &&
      isDirty &&
      !window.confirm("Switch workflows and discard unsaved changes?")
    ) {
      return;
    }
    applyWorkflowRecord(record);
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) {
        toast.error("A node cannot connect to itself.");
        return;
      }

      setEdges((currentEdges) => {
        if (
          currentEdges.some(
            (edge) =>
              edge.source === connection.source &&
              edge.target === connection.target,
          )
        ) {
          toast.error("That connection already exists.");
          return currentEdges;
        }

        const sourceNode = nodes.find((node) => node.id === connection.source);
        const branch = sourceNode?.data.kind === "condition" ? "true" : undefined;
        return addEdge({
          ...connection,
          id: nanoid(6),
          label: branch,
          data: branch ? { branch } : undefined,
        }, currentEdges);
      });
    },
    [nodes, setEdges],
  );

  const addNode = (kind: NodeKind) => {
    const id = nanoid(6);
    const defaults: Partial<WNodeData> =
      kind === "llm"
        ? { prompt: "You are a helpful assistant.", model: "gpt-4o-mini" }
        : kind === "trigger"
          ? { input: "" }
          : kind === "condition"
            ? { condition: "input.trim().length > 0" }
            : kind === "loop"
              ? {
                  itemsExpr: "input.split('\\n').filter(Boolean)",
                  bodyCode: "return context.item;",
                  maxIterations: 50,
                }
              : kind === "tool"
                ? { toolArgs: "{ input }" }
                : {};

    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id,
        type: "wnode",
        position: {
          x: 200 + currentNodes.length * 30,
          y: 260 + currentNodes.length * 20,
        },
        data: { label: KIND_LABEL[kind], kind, ...defaults },
      },
    ]);
  };

  const updateSelected = (patch: Partial<WNodeData>) => {
    if (!selected) return;
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selected.id
          ? { ...node, data: { ...node.data, ...patch } }
          : node,
      ),
    );
  };

  const deleteSelected = () => {
    if (!selected) return;
    setNodes((currentNodes) =>
      currentNodes.filter((node) => node.id !== selected.id),
    );
    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          edge.source !== selected.id && edge.target !== selected.id,
      ),
    );
    setSelectedId(null);
  };

  const setConditionEdgeBranch = (edgeId: string, branch: BranchName) => {
    setEdges((currentEdges) =>
      currentEdges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              label: branch,
              data: { ...(edge.data || {}), branch },
            }
          : edge,
      ),
    );
  };

  const saveWorkflow = async () => {
    setSavingWorkflow(true);
    try {
      const record = buildWorkflowRecord(
        activeWorkflowId,
        workflowName,
        nodes,
        edges,
      );
      const nextLibrary = [
        record,
        ...workflowLibrary.filter((item) => item.id !== record.id),
      ];

      await api.saveWorkflows(nextLibrary);
      setWorkflowLibrary(nextLibrary);
      setActiveWorkflowId(record.id);
      setWorkflowName(record.name);
      setSavedAt(record.updatedAt);
      setLastSavedSnapshot(
        serializeWorkflowState(record.id, record.name, nodes, edges),
      );
      toast.success("Workflow saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingWorkflow(false);
    }
  };

  const duplicateWorkflow = async () => {
    setSavingWorkflow(true);
    try {
      const record = buildWorkflowRecord(
        nanoid(8),
        `${workflowName.trim() || DEFAULT_WORKFLOW_NAME} copy`,
        nodes,
        edges,
      );
      const nextLibrary = [
        record,
        ...workflowLibrary.filter((item) => item.id !== record.id),
      ];
      await api.saveWorkflows(nextLibrary);
      setWorkflowLibrary(nextLibrary);
      applyWorkflowRecord(record);
      toast.success("Workflow duplicated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingWorkflow(false);
    }
  };

  const deleteWorkflow = async () => {
    const existing = workflowLibrary.find((item) => item.id === activeWorkflowId);
    if (!existing) {
      toast.error("Save this workflow before deleting it from the library.");
      return;
    }
    if (!window.confirm(`Delete workflow "${existing.name}"?`)) {
      return;
    }

    setSavingWorkflow(true);
    try {
      const nextLibrary = workflowLibrary.filter((item) => item.id !== activeWorkflowId);
      await api.saveWorkflows(nextLibrary);
      setWorkflowLibrary(nextLibrary);
      if (nextLibrary.length > 0) {
        applyWorkflowRecord(nextLibrary[0]);
      } else {
        setActiveWorkflowId(nanoid(8));
        setWorkflowName(DEFAULT_WORKFLOW_NAME);
        setNodes(cloneInitialNodes());
        setEdges(cloneInitialEdges());
        setSelectedId(null);
        setOutputs({});
        setTrace([]);
        setMemoryContext([]);
        setSavedAt(null);
        setLastSavedSnapshot("");
      }
      toast.success("Workflow deleted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingWorkflow(false);
    }
  };

  const resetWorkflow = () => {
    setNodes(cloneInitialNodes());
    setEdges(cloneInitialEdges());
    setSelectedId(null);
    setOutputs({});
    setTrace([]);
    setMemoryContext([]);
    setWorkflowUsage(null);
    setWorkflowCost(0);
    setNodeUsage([]);
    toast.success("Workflow reset to starter template");
  };

  const applyWorkflowTemplate = () => {
    const template = WORKFLOW_TEMPLATES.find((entry) => entry.id === selectedTemplateId);
    if (!template) {
      toast.error("Select a workflow template first.");
      return;
    }
    if (isDirty && !window.confirm("Discard unsaved workflow changes and load this template?")) {
      return;
    }

    const nextNodes = materializeWorkflowNodes(template.nodes);
    const nextEdges = materializeWorkflowEdges(template.edges);
    const nextId = nanoid(8);
    setActiveWorkflowId(nextId);
    setWorkflowName(template.name);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedId(null);
    setInput(template.defaultInput);
    setOutputs({});
    setTrace([]);
    setMemoryContext([]);
    setWorkflowUsage(null);
    setWorkflowCost(0);
    setNodeUsage([]);
    setSavedAt(null);
    setLastSavedSnapshot("");
    toast.success(`Loaded template: ${template.name}`);
  };

  const execute = async () => {
    const validationErrors = validateWorkflow(nodes, edges);
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }

    setRunning(true);
    setOutputs({});
    setTrace([]);
    setWorkflowUsage(null);
    setWorkflowCost(0);
    setNodeUsage([]);

    try {
      const workflow = {
        nodes: nodes.map((node) => ({
          id: node.id,
          type: node.data.kind,
          data: node.data,
        })),
        edges: edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          branch: (edge.data as { branch?: BranchName } | undefined)?.branch,
        })),
      };
      const result = await api.executeWorkflow(workflow, input, {
        workflowId: activeWorkflowId,
        workflowName,
      });
      setOutputs(result.outputs);
      setTrace(result.trace);
      setMemoryContext(result.memoryContext || []);
      setWorkflowUsage(result.tokenUsage || null);
      setWorkflowCost(result.costEstimateUsd || 0);
      setNodeUsage(result.nodeUsage || []);
      const history = await api.listExecutions({
        kind: "workflow",
        targetId: activeWorkflowId,
        limit: 12,
      });
      setExecutionHistory(history.entries);
      toast.success("Workflow executed");
    } catch (e: any) {
      toast.error(e.message);
      const history = await api.listExecutions({
        kind: "workflow",
        targetId: activeWorkflowId,
        limit: 12,
      }).catch(() => null);
      if (history) setExecutionHistory(history.entries);
    } finally {
      setRunning(false);
    }
  };

  const saveLatestOutputToMemory = async () => {
    const latest = Object.entries(outputs).at(-1);
    if (!latest) return;
    setSavingOutputToMemory(true);
    try {
      await api.addMemory({
        content: latest[1],
        memoryType: "summary",
        source: `workflow:${activeWorkflowId}`,
        importanceScore: 0.75,
      });
      toast.success("Latest workflow output saved to memory");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingOutputToMemory(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 p-6 xl:grid-cols-[300px,1fr,340px]">
      <div className="space-y-6 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto">
        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b bg-muted/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">Current Workflow</CardTitle>
                <CardDescription>Builder-focused workspace for the active draft and execution cycle.</CardDescription>
              </div>
              <Link href="/workflow">
                <Button variant="outline" size="sm" className="rounded-full">
                  Workflow Library
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <WorkflowMetric
                title="State"
                value={isDirty ? "Unsaved" : "Saved"}
                detail={loadingSaved ? "Loading workflow state" : formatDateTime(savedAt)}
                icon={<Save className="h-4 w-4" />}
              />
              <WorkflowMetric
                title="Library"
                value={String(workflowLibrary.length)}
                detail={activeSavedWorkflow ? "Saved workflows available" : "Draft not saved yet"}
                icon={<Layers3 className="h-4 w-4" />}
              />
              <WorkflowMetric
                title="Canvas shape"
                value={`${canvasSummary.nodeCount} nodes`}
                detail={`${canvasSummary.edgeCount} edges | ${canvasSummary.llmNodes} LLM | ${canvasSummary.outputs} outputs`}
                icon={<Workflow className="h-4 w-4" />}
              />
            </div>

            <div
              className={`rounded-2xl border p-4 text-sm ${
                isDirty
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-950"
                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-950"
              }`}
            >
              <div className="font-semibold">
                {activeSavedWorkflow ? activeSavedWorkflow.name : "Draft-only workflow"}
              </div>
              <div className="mt-2 text-xs leading-5">
                {activeWorkflowStateDetail}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant={isDirty ? "destructive" : "secondary"} className="rounded-full px-3 py-1">
                  {activeWorkflowStateLabel}
                </Badge>
                {activeSavedWorkflow ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {activeSavedWorkflow.id}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Workflow name</Label>
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Workflow name"
              />
              <div className="text-xs text-muted-foreground">
                Use a stable, task-oriented name so the library is easy to scan later.
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Primary actions
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Button
                variant="secondary"
                className="justify-start rounded-full"
                onClick={saveWorkflow}
                disabled={savingWorkflow || loadingSaved}
              >
                {savingWorkflow ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                variant="outline"
                className="justify-start rounded-full"
                onClick={duplicateWorkflow}
                disabled={savingWorkflow || loadingSaved}
              >
                <GitBranchPlus className="mr-2 h-4 w-4" />
                Save as copy
              </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Draft controls
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Button
                variant="outline"
                className="justify-start rounded-full"
                onClick={createStarterWorkflow}
                disabled={loadingSaved}
              >
                <Plus className="mr-2 h-4 w-4" />
                New starter
              </Button>
              <Button
                variant="outline"
                className="justify-start rounded-full"
                onClick={resetWorkflow}
                disabled={loadingSaved}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset starter
              </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Template library
              </div>
              <div className="space-y-2">
                <select
                  aria-label="Workflow template"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {WORKFLOW_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-full"
                  onClick={applyWorkflowTemplate}
                  disabled={loadingSaved}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Load template
                </Button>
                <div className="rounded-2xl border bg-muted/15 p-3 text-xs leading-5 text-muted-foreground">
                  {WORKFLOW_TEMPLATES.find((entry) => entry.id === selectedTemplateId)?.description ||
                    "Pick a bundled template to start from a known automation shape."}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Destructive
              </div>
              <Button
                variant="outline"
                className="justify-start rounded-full"
                onClick={deleteWorkflow}
                disabled={savingWorkflow || loadingSaved}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete saved workflow
              </Button>
            </div>

            <div className="rounded-2xl border bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
              {loadingSaved
                ? "Loading saved workflow..."
                : savedAt
                  ? `Last saved ${formatDateTime(savedAt)}`
                  : "No saved workflow yet"}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Add Node</CardTitle>
            <CardDescription>Grow the canvas from a small set of durable building blocks.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 p-4">
            {(["trigger", "llm", "code", "tool", "telegram", "condition", "loop", "output"] as NodeKind[]).map((kind) => (
              <Button
                key={kind}
                variant="outline"
                className="justify-start rounded-full"
                onClick={() => addNode(kind)}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${KIND_COLOR[kind]}`} />
                {KIND_LABEL[kind]}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Run</CardTitle>
            <CardDescription>Launch the current graph with a single input and capture outputs, trace, and usage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkflowMetric
                title="Run status"
                value={readyToRun ? "Ready" : "Needs work"}
                detail={readyToRun ? "The active canvas passes baseline validation." : validationErrors[0]}
                icon={<Play className="h-4 w-4" />}
              />
              <WorkflowMetric
                title="Input source"
                value={input.trim() ? "Manual input" : "Trigger default"}
                detail={input.trim() ? "The run panel input will seed the next execution." : "Trigger node input will be used when present."}
                icon={<Sparkles className="h-4 w-4" />}
              />
            </div>
            {replayRunId && (
              <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-950">
                Loaded from History run <code>{replayRunId}</code>. The previous workflow input is ready to replay.
              </div>
            )}
            {validationErrors.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-950">
                {validationErrors[0]}
              </div>
            )}
            <div className="space-y-2">
              <Label>Input</Label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Initial input used when the trigger node has no inline input"
                className="min-h-[110px]"
              />
            </div>
            <div className="grid gap-2">
              <Button className="rounded-full" onClick={execute} disabled={running}>
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Execute
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={saveLatestOutputToMemory}
                disabled={savingOutputToMemory || Object.keys(outputs).length === 0}
              >
                {savingOutputToMemory ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save latest output
              </Button>
            </div>
            <div className="rounded-2xl border bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
              Running the workflow validates only the active canvas. Saving is still a separate step, so keep important drafts in the library before switching to another workflow.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-h-0 flex-col gap-6">
        <section className="rounded-[2rem] border bg-[linear-gradient(135deg,rgba(15,23,42,0.03),rgba(124,58,237,0.08),rgba(8,145,178,0.08))] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full border bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Workflow authoring
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">Workflow Builder</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Build operator-grade flows from a complete graph: trigger, LLM, code, tool, Telegram, condition, loop, and output. Save stable versions, branch safely, and inspect runtime evidence after every execution.
                </p>
              </div>
            </div>
            <Badge variant={isDirty ? "destructive" : "secondary"} className="rounded-full px-3 py-1">
              {isDirty ? "unsaved changes" : "saved state"}
            </Badge>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <WorkflowMetric
              title="Nodes"
              value={String(nodes.length)}
              detail={`${edges.length} edges on the canvas`}
              icon={<Workflow className="h-4 w-4" />}
            />
            <WorkflowMetric
              title="Latest run"
              value={formatTokenUsage(workflowUsage)}
              detail={`Cost ${formatCost(workflowCost)}`}
              icon={<Sparkles className="h-4 w-4" />}
            />
            <WorkflowMetric
              title="Execution trace"
              value={String(trace.length)}
              detail={trace.length ? "Steps captured in the latest run" : "No run trace yet"}
              icon={<Clock3 className="h-4 w-4" />}
            />
            <WorkflowMetric
              title="Memory context"
              value={String(memoryContext.length)}
              detail={memoryContext.length ? "Entries injected into the latest run" : "No memory attached yet"}
              icon={<Brain className="h-4 w-4" />}
            />
          </div>
        </section>

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Canvas</CardTitle>
            <CardDescription>Click a node to edit it. Use the flow controls to zoom, pan, and inspect graph structure.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[calc(100vh-21rem)] min-h-[540px]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(null)}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-24 xl:h-[calc(100vh-7rem)] xl:overflow-y-auto">
        {selected ? (
          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">Node Inspector</CardTitle>
                  <CardDescription>Adjust the selected node without leaving the canvas.</CardDescription>
                </div>
                <Badge className={`${KIND_COLOR[selected.data.kind]} rounded-full`}>
                  {KIND_LABEL[selected.data.kind]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="rounded-2xl border bg-muted/15 p-4 text-xs leading-6 text-muted-foreground">
                Node id: <code>{selected.id}</code>
                <br />
                {getNodeInspectorHint(selected.data.kind)}
              </div>
              <div className="grid gap-2">
                <Label>Label</Label>
                <Input
                  value={selected.data.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                />
              </div>
              {selected.data.kind === "trigger" && (
                <div className="grid gap-2">
                  <Label>Initial input</Label>
                  <Textarea
                    value={selected.data.input || ""}
                    onChange={(e) => updateSelected({ input: e.target.value })}
                  />
                </div>
              )}
              {selected.data.kind === "llm" && (
                <>
                  <div className="grid gap-2">
                    <Label>Provider lane</Label>
                    <select
                      value={selected.data.provider || "primary"}
                      onChange={(e) =>
                        updateSelected({ provider: e.target.value as "primary" | "fallback" })
                      }
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="primary">Primary provider</option>
                      <option value="fallback">Fallback provider</option>
                    </select>
                  </div>
                  {fallbackWarning && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      {fallbackWarning}
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label>Model override</Label>
                    <Input
                      value={selected.data.model || ""}
                      onChange={(e) => updateSelected({ model: e.target.value })}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>System prompt</Label>
                    <Textarea
                      className="min-h-[140px]"
                      value={selected.data.prompt || ""}
                      onChange={(e) =>
                        updateSelected({ prompt: e.target.value })
                      }
                    />
                  </div>
                </>
              )}
              {selected.data.kind === "code" && (
                <div className="grid gap-2">
                  <Label>JavaScript Code</Label>
                  <div className="text-[11px] text-muted-foreground">
                    Available variables: <code>input</code>
                  </div>
                  <Textarea
                    className="min-h-[140px] font-mono text-xs"
                    value={selected.data.code || ""}
                    onChange={(e) => updateSelected({ code: e.target.value })}
                    placeholder="return input.toUpperCase();"
                  />
                </div>
              )}
              {selected.data.kind === "tool" && (
                <>
                  <div className="grid gap-2">
                    <Label>Registered Tool</Label>
                    <select
                      value={selected.data.toolName || ""}
                      onChange={(e) => updateSelected({ toolName: e.target.value })}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">
                        {loadingTools ? "Loading tools..." : "Select a tool"}
                      </option>
                      {tools.map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name} ({tool.riskLevel})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Manual Tool Name</Label>
                    <Input
                      value={selected.data.toolName || ""}
                      onChange={(e) => updateSelected({ toolName: e.target.value })}
                      placeholder="e.g. read_file"
                    />
                    {selected.data.toolName ? (
                      <div className="text-[11px] text-muted-foreground">
                        {tools.find((tool) => tool.name === selected.data.toolName)?.description || "Manual tool names are allowed for compatibility."}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <Label>Tool Arguments (JSON or JS Object)</Label>
                    <div className="text-[11px] text-muted-foreground">
                      Can reference <code>input</code>. E.g. <code>{`{ query: input }`}</code>
                    </div>
                    <Textarea
                      className="min-h-[140px] font-mono text-xs"
                      value={selected.data.toolArgs || ""}
                      onChange={(e) => updateSelected({ toolArgs: e.target.value })}
                      placeholder='{ "prompt": input }'
                    />
                  </div>
                </>
              )}
              {selected.data.kind === "condition" && (
                <>
                  <div className="grid gap-2">
                    <Label>Condition expression</Label>
                    <div className="text-[11px] text-muted-foreground">
                      Must evaluate to true or false. Available variables: <code>input</code>, <code>context.outputs</code>.
                    </div>
                    <Textarea
                      className="min-h-[110px] font-mono text-xs"
                      value={selected.data.condition || ""}
                      onChange={(e) => updateSelected({ condition: e.target.value })}
                      placeholder="input.trim().length > 0"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Outgoing branches</Label>
                    {selectedOutgoingEdges.length === 0 ? (
                      <div className="rounded-2xl border bg-muted/15 p-3 text-xs text-muted-foreground">
                        Connect this condition to one or more downstream nodes. New connections default to the true branch.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedOutgoingEdges.map((edge) => (
                          <div key={edge.id} className="flex items-center gap-2 rounded-2xl border bg-muted/15 p-2">
                            <code className="min-w-0 flex-1 truncate text-xs">{edge.target}</code>
                            <select
                              value={(edge.data as { branch?: BranchName } | undefined)?.branch || "true"}
                              onChange={(e) => setConditionEdgeBranch(edge.id, e.target.value as BranchName)}
                              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
              {selected.data.kind === "loop" && (
                <>
                  <div className="grid gap-2">
                    <Label>Items expression</Label>
                    <div className="text-[11px] text-muted-foreground">
                      Must return an array. Available variables: <code>input</code>, <code>context.outputs</code>.
                    </div>
                    <Textarea
                      className="min-h-[100px] font-mono text-xs"
                      value={selected.data.itemsExpr || ""}
                      onChange={(e) => updateSelected({ itemsExpr: e.target.value })}
                      placeholder="input.split('\n').filter(Boolean)"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Max iterations</Label>
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={selected.data.maxIterations ?? 50}
                      onChange={(e) =>
                        updateSelected({
                          maxIterations: Math.max(1, Math.min(500, Number(e.target.value) || 50)),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Body code</Label>
                    <div className="text-[11px] text-muted-foreground">
                      Runs once per item. Use <code>context.item</code>, <code>context.index</code>, and <code>context.total</code>.
                    </div>
                    <Textarea
                      className="min-h-[140px] font-mono text-xs"
                      value={selected.data.bodyCode || ""}
                      onChange={(e) => updateSelected({ bodyCode: e.target.value })}
                      placeholder="return context.item;"
                    />
                  </div>
                </>
              )}
              {selected.data.kind === "telegram" && (
                <div className="grid gap-2">
                  <Label>Chat ID (Optional)</Label>
                  <div className="text-[11px] text-muted-foreground">
                    Leave empty to use global setting or context.
                  </div>
                  <Input
                    value={selected.data.chatId || ""}
                    onChange={(e) => updateSelected({ chatId: e.target.value })}
                    placeholder="e.g. 12345678"
                  />
                  <div className="text-[11px] text-muted-foreground mt-2">
                    The node will send the <code>input</code> to this chat.
                  </div>
                </div>
              )}
              <Button variant="outline" className="w-full rounded-full" onClick={deleteSelected}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete node
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-[1.75rem] shadow-sm">
            <CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-6 text-center">
              <Workflow className="h-10 w-10 text-muted-foreground" />
              <div className="text-lg font-semibold">No node selected</div>
              <div className="max-w-sm text-sm leading-6 text-muted-foreground">
                Click a node on the canvas to edit its label, prompt, provider lane, or inline input.
              </div>
              <div className="rounded-2xl border bg-muted/15 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Start with Trigger -&gt; LLM -&gt; Output, then add code nodes only where deterministic transforms are actually needed.
              </div>
            </CardContent>
          </Card>
        )}

        {(Object.keys(outputs).length > 0 || trace.length > 0) && (
          <Card className="rounded-[1.75rem] shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-xl">Execution Result</CardTitle>
              <CardDescription>Latest outputs, trace, memory context, and per-node usage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <WorkflowMetric
                  title="Workflow usage"
                  value={formatTokenUsage(workflowUsage)}
                  detail={`Estimated cost ${formatCost(workflowCost)}`}
                  icon={<Sparkles className="h-4 w-4" />}
                />
                <WorkflowMetric
                  title="Trace entries"
                  value={String(trace.length)}
                  detail={nodeUsage.length ? `${nodeUsage.length} LLM node usage records` : "No node usage captured"}
                  icon={<Clock3 className="h-4 w-4" />}
                />
              </div>
              {memoryContext.length > 0 && (
                <div className="rounded-2xl border bg-amber-50/70 p-4 text-sm">
                  <div className="font-semibold text-amber-900">Memory context</div>
                  <div className="mt-3 space-y-2">
                    {memoryContext.map((entry) => (
                      <div key={entry.id} className="rounded-xl border bg-white/70 p-3 text-xs leading-5 text-amber-950">
                        [{entry.memoryType}] {entry.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {trace.length > 0 && (
                <div className="rounded-2xl border bg-muted/15 p-4">
                  <div className="font-semibold">Trace</div>
                  <div className="mt-3 space-y-2">
                    {trace.map((item, index) => (
                      <div key={index} className="rounded-xl border bg-background p-3 text-xs leading-5 text-muted-foreground">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nodeUsage.length > 0 && (
                <div className="rounded-2xl border bg-muted/15 p-4">
                  <div className="font-semibold">LLM node usage</div>
                  <div className="mt-3 space-y-2">
                    {nodeUsage.map((item) => (
                      <div key={item.nodeId} className="rounded-xl border bg-background p-3 text-xs leading-5 text-muted-foreground">
                        {item.label} | {item.provider} / {item.model} | {formatTokenUsage(item.usage)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.entries(outputs).map(([id, value]) => {
                const node = nodes.find((entry) => entry.id === id);
                return (
                  <div key={id} className="rounded-2xl border bg-muted/15 p-4">
                    <div className="text-sm font-semibold">
                      {node?.data.label} ({id})
                    </div>
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border bg-background p-3 text-xs">
                      {value}
                    </pre>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card className="rounded-[1.75rem] shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-xl">Run History</CardTitle>
            <CardDescription>Recent executions for the current workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {executionHistory.length === 0 && (
              <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No workflow runs yet.
              </div>
            )}
            {executionHistory.map((entry) => (
              <div key={entry.id} className="rounded-2xl border bg-card/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{entry.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</div>
                  </div>
                  <Badge
                    variant={entry.status === "success" ? "secondary" : "destructive"}
                    className="rounded-full px-3 py-1 capitalize"
                  >
                    {entry.status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                  <div>{formatTokenUsage(entry.tokenUsage)}</div>
                  <div>{formatCost(entry.costEstimateUsd)}</div>
                </div>
                <div className="mt-3 text-xs leading-5 text-muted-foreground">{entry.summary}</div>
                {entry.inputPreview && (
                  <div className="mt-3 rounded-xl bg-muted/35 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                    Input: {entry.inputPreview}
                  </div>
                )}
                {entry.outputPreview && (
                  <div className="mt-2 rounded-xl bg-muted/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                    Output: {entry.outputPreview}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkflowMetric({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border bg-card/85 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
        <Sparkles className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div className="mt-1 line-clamp-2 text-lg font-semibold text-balance">{value}</div>
      <div className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</div>
    </div>
  );
}
