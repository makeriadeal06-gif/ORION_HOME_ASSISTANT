import { useDistributedStore } from '../state/useDistributedStore';
import { NodeInfo, NodeMode, NodeType } from '../types';
import { socketRuntime } from '../../socket/SocketRuntime';
import { logger } from '../../logger/Logger';
import { NodePersistenceLayer } from '../persistence/NodePersistenceLayer';
import { PrimaryNodeConsensusPolicy } from './PrimaryNodeConsensusPolicy';
import { SafeDistributedRuntimeGuard } from '../SafeDistributedRuntimeGuard';

export class NodeLifecycleManager {
  private static nodeId: string;
  private static heartbeatInterval: any;

  public static init() {
    this.nodeId = NodePersistenceLayer.getPersistentNodeId();
    
    const type = this.detectNodeType();
    const currentNode: NodeInfo = {
      id: this.nodeId,
      type,
      mode: NodeMode.SECONDARY,
      lastSeen: Date.now(),
      isPrimary: false,
      userAgent: SafeDistributedRuntimeGuard.safeTransform(navigator.userAgent, 'lower')
    };

    useDistributedStore.getState().setCurrentNode(currentNode);
    NodePersistenceLayer.saveNodeState(currentNode);
    
    logger.info('NODE_RUNTIME', `Node_Identity_Established: ${this.nodeId} [${type}]`);

    this.setupListeners();
    this.startHeartbeat();
  }

  private static detectNodeType(): NodeType {
    const ua = SafeDistributedRuntimeGuard.safeTransform(navigator.userAgent, 'lower');
    if (/mobile|iphone|android/.test(ua)) return NodeType.MOBILE;
    if (/tablet|ipad/.test(ua)) return NodeType.TABLET;
    return NodeType.DESKTOP;
  }

  private static setupListeners() {
    socketRuntime.on('node:sync', (nodes: Record<string, NodeInfo>) => {
      if (!nodes) return;
      Object.values(nodes).forEach(node => {
        if (node && node.id) {
          useDistributedStore.getState().upsertNode(node);
        }
      });
      this.runArbitration();
    });

    socketRuntime.on('node:removed', (id: string) => {
      if (!id) return;
      useDistributedStore.getState().removeNode(id);
      this.runArbitration();
    });
  }

  private static startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    
    this.heartbeatInterval = setInterval(() => {
      const current = useDistributedStore.getState().currentNode;
      if (current) {
        socketRuntime.emit('node:heartbeat', {
          ...current,
          lastSeen: Date.now()
        });
      }
    }, 10000); // Reduced frequency (10s) for Calm Mode
  }

  private static runArbitration() {
    PrimaryNodeConsensusPolicy.runArbitration(this.nodeId);
  }
}
