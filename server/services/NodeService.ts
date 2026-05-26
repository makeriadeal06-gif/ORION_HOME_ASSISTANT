export interface NodeInfo {
  id: string;
  type: string;
  mode: string;
  lastSeen: number;
  isPrimary: boolean;
  userAgent: string;
}

class NodeService {
  private nodes: Map<string, NodeInfo> = new Map();

  public updateNode(node: NodeInfo) {
    this.nodes.set(node.id, node);
    this.cleanup();
  }

  public removeNode(id: string) {
    this.nodes.delete(id);
  }

  public getAllNodes(): Record<string, NodeInfo> {
    return Object.fromEntries(this.nodes);
  }

  private cleanup() {
    const now = Date.now();
    for (const [id, node] of this.nodes.entries()) {
      if (now - node.lastSeen > 30000) { // 30s timeout
        this.nodes.delete(id);
      }
    }
  }
}

export const nodeService = new NodeService();
