import { NodeInfo, NodeMode } from '../types';
import { useDistributedStore } from '../state/useDistributedStore';
import { logger } from '../../logger/Logger';

export class PrimaryNodeConsensusPolicy {
  private static electionTimeout: any;

  public static runArbitration(currentNodeId: string) {
    if (this.electionTimeout) clearTimeout(this.electionTimeout);

    // Arbitration Cooldown to prevent flapping
    this.electionTimeout = setTimeout(() => {
      this.executeConsensus(currentNodeId);
    }, 1000);
  }

  private static executeConsensus(currentNodeId: string) {
    const store = useDistributedStore.getState();
    const nodes = Object.values(store.activeNodes)
      .filter(n => n && n.id && (Date.now() - n.lastSeen < 15000)); // Only active nodes

    if (nodes.length === 0) return;

    // Deterministic sort: Priority by type (Desktop > Tablet > Mobile) then ID
    const sortedNodes = nodes.sort((a, b) => {
      const typeOrder = { DESKTOP: 0, TABLET: 1, MOBILE: 2, EDGE: 3 };
      const orderA = typeOrder[a.type as keyof typeof typeOrder] ?? 99;
      const orderB = typeOrder[b.type as keyof typeof typeOrder] ?? 99;
      
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

    const primaryCandidate = sortedNodes[0];
    const isPrimary = primaryCandidate.id === currentNodeId;
    const currentMode = isPrimary ? NodeMode.PRIMARY : NodeMode.SECONDARY;

    // Check if we are changing state
    const current = store.currentNode;
    if (current && (current.isPrimary !== isPrimary || current.mode !== currentMode)) {
      logger.info('DISTRIBUTED_CONSENSUS', `Node ownership lock: ${isPrimary ? 'PRIMARY' : 'SECONDARY'}`);
      store.updateNode(currentNodeId, { isPrimary, mode: currentMode });
    }
  }
}
