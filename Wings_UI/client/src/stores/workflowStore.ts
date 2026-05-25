import { create } from 'zustand';
import { Node, Edge } from 'reactflow';

export interface WorkflowNode extends Node {
  data: {
    label: string;
    type: 'trigger' | 'action' | 'condition' | 'output';
    config?: Record<string, any>;
    mcpToolId?: string;
  };
}

export type WorkflowEdge = Edge & {
  source: string;
  target: string;
  id: string;
}

interface WorkflowStore {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNode: WorkflowNode | null;
  
  // Node operations
  addNode: (node: WorkflowNode) => void;
  updateNode: (nodeId: string, data: Partial<WorkflowNode>) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (node: WorkflowNode | null) => void;
  
  // Edge operations
  addEdge: (edge: WorkflowEdge) => void;
  deleteEdge: (edgeId: string) => void;
  
  // Workflow operations
  setNodes: (nodes: WorkflowNode[]) => void;
  setEdges: (edges: WorkflowEdge[]) => void;
  clearWorkflow: () => void;
  
  // Validation
  validateWorkflow: () => { valid: boolean; errors: string[] };
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node],
  })),
  
  updateNode: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((node) =>
      node.id === nodeId ? { ...node, ...data } : node
    ),
  })),
  
  deleteNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter((node) => node.id !== nodeId),
    edges: state.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId
    ),
  })),
  
  setSelectedNode: (node) => set({ selectedNode: node }),
  
  addEdge: (edge) => set((state) => ({
    edges: [...state.edges, edge],
  })),
  
  deleteEdge: (edgeId) => set((state) => ({
    edges: state.edges.filter((edge) => edge.id !== edgeId),
  })),
  
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  
  clearWorkflow: () => set({
    nodes: [],
    edges: [],
    selectedNode: null,
  }),
  
  validateWorkflow: () => {
    const state = get();
    const errors: string[] = [];
    
    // Check if there's at least one trigger
    const hasTrigger = state.nodes.some((node) => node.data.type === 'trigger');
    if (!hasTrigger) {
      errors.push('Workflow must have at least one trigger');
    }
    
    // Check if there's at least one action
    const hasAction = state.nodes.some((node) => node.data.type === 'action');
    if (!hasAction) {
      errors.push('Workflow must have at least one action');
    }
    
    // Check if all nodes are connected
    const connectedNodeIds = new Set<string>();
    state.edges.forEach((edge) => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });
    
    state.nodes.forEach((node) => {
      if (!connectedNodeIds.has(node.id) && state.nodes.length > 1) {
        errors.push(`Node "${node.data.label}" is not connected`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
}));
