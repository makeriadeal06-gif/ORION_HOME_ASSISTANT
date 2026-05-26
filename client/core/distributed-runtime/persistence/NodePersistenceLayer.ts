import { logger } from '../../logger/Logger';
import { NodeInfo } from '../types';

export class NodePersistenceLayer {
  private static KEY_NODE_ID = 'orion_node_id';

  public static getPersistentNodeId(): string {
    let id = localStorage.getItem(this.KEY_NODE_ID);
    if (!id) {
      id = `node_${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem(this.KEY_NODE_ID, id);
    }
    return id;
  }

  public static saveNodeState(node: NodeInfo) {
    try {
      localStorage.setItem(`orion_node_state_${node.id}`, JSON.stringify(node));
    } catch (e) {
      // Ignore quota errors
    }
  }

  public static clearState() {
    localStorage.removeItem(this.KEY_NODE_ID);
  }
}
