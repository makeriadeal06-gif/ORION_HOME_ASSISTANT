import { logger } from '@core/logger/Logger';
import { useAndroidAwarenessStore } from '@core/android-runtime/awareness/useAndroidAwarenessStore';
import { actionExecutorEngine } from '@core/action-executor/ActionExecutorEngine';
import { useCognitiveModeStore } from './modes/useCognitiveModeStore';
import { CognitiveModeAdapter } from './modes/CognitiveModeAdapter';
import { operationalMemoryEngine } from './memory/OperationalMemoryEngine';
import { 
  OperationalImportance, 
  OperationalDecisionType, 
  OperationalSituation, 
  OperationalDecision 
} from './types';

// STABILITY FREEZE
// DO NOT MODIFY WITHOUT ARCHITECTURAL REVIEW.
// FREEZE_PHASE_09_OPERATIONAL_MEMORY

/**
 * OPERATIONAL CONSCIOUSNESS ENGINE
 * 
 * Interprets system states from Android Awareness, 
 * classifies situations by importance, and produces 
 * operational decisions to be executed by the Action Executor.
 * 
 * Modulated by Cognitive Modes and Operational Memory.
 */
class OperationalConsciousnessEngine {
  private static instance: OperationalConsciousnessEngine;
  private initialized = false;
  private lastDecisionAt: Record<OperationalDecisionType, number> = {
    [OperationalDecisionType.ENTER_POWER_SAVE_MODE]: 0,
    [OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY]: 0,
    [OperationalDecisionType.PRESERVE_NETWORK_USAGE]: 0,
    [OperationalDecisionType.NO_ACTION]: 0,
  };

  private readonly DECISION_COOLDOWN = 300000; // 5 minutes

  private constructor() {}

  public static getInstance(): OperationalConsciousnessEngine {
    if (!OperationalConsciousnessEngine.instance) {
      OperationalConsciousnessEngine.instance = new OperationalConsciousnessEngine();
    }
    return OperationalConsciousnessEngine.instance;
  }

  public init(): void {
    if (this.initialized) return;
    
    this.initialized = true;
    this.subscribeToAwareness();
    
    logger.info('OPERATIONAL_CONSCIOUSNESS', 'engine_initialized=true');
  }

  private subscribeToAwareness(): void {
    useAndroidAwarenessStore.subscribe((state) => {
      this.recordAwarenessToMemory(state);
      this.evaluateSituations(state);
    });
  }

  private recordAwarenessToMemory(state: any): void {
    // FREEZE_PHASE_09_OPERATIONAL_MEMORY
    operationalMemoryEngine.record('awareness_update', 'battery', state.battery);
    operationalMemoryEngine.record('awareness_update', 'network', state.network);
    operationalMemoryEngine.record('awareness_update', 'power', state.power);
  }

  private evaluateSituations(state: any): void {
    const situations: OperationalSituation[] = [];

    // 1. Battery Evaluation
    if (state.battery.level > 0 && state.battery.level < 0.15 && state.battery.status !== 'charging') {
      situations.push({
        id: `batt_low_${Date.now()}`,
        importance: OperationalImportance.HIGH,
        description: `Critical battery level: ${(state.battery.level * 100).toFixed(0)}%`,
        source: 'battery',
        timestamp: Date.now()
      });
    }

    // 2. Temperature Evaluation
    if (state.battery.temperature > 45) {
      situations.push({
        id: `temp_high_${Date.now()}`,
        importance: OperationalImportance.CRITICAL,
        description: `High system temperature: ${state.battery.temperature}°C`,
        source: 'battery',
        timestamp: Date.now()
      });
    }

    // 3. Network Evaluation
    if (state.network.isMetered && state.network.isConnected) {
      situations.push({
        id: `net_metered_${Date.now()}`,
        importance: OperationalImportance.MEDIUM,
        description: 'Using metered network connection',
        source: 'network',
        timestamp: Date.now()
      });
    }

    // 4. Idle Evaluation
    if (!state.power.isInteractive && state.battery.status !== 'charging' && state.battery.level < 0.8) {
      situations.push({
        id: `device_idle_${Date.now()}`,
        importance: OperationalImportance.LOW,
        description: 'Device is idle and not charging',
        source: 'power',
        timestamp: Date.now()
      });
    }

    if (situations.length > 0) {
      situations.forEach(s => operationalMemoryEngine.record('situation', s.source, s));
      this.processSituations(situations);
    }
  }

  private processSituations(situations: OperationalSituation[]): void {
    // Sort by importance (CRITICAL > HIGH > MEDIUM > LOW)
    const importanceMap = {
      [OperationalImportance.CRITICAL]: 4,
      [OperationalImportance.HIGH]: 3,
      [OperationalImportance.MEDIUM]: 2,
      [OperationalImportance.LOW]: 1,
    };

    const sortedSituations = [...situations].sort((a, b) => 
      importanceMap[b.importance] - importanceMap[a.importance]
    );

    for (const situation of sortedSituations) {
      const decision = this.makeDecision(situation);
      if (decision && decision.type !== OperationalDecisionType.NO_ACTION) {
        this.dispatchDecision(decision);
        // Only process the most important decision per evaluation cycle for now
        break; 
      }
    }
  }

  private makeDecision(situation: OperationalSituation): OperationalDecision | null {
    const activeMode = useCognitiveModeStore.getState().activeMode;
    // FREEZE_PHASE_09_OPERATIONAL_MEMORY
    const memory = operationalMemoryEngine.getContextSnapshot();
    
    // Memory-based refinements
    if (situation.source === 'battery' && situation.importance === OperationalImportance.HIGH) {
      // If battery is rising (charging), ignore low battery situation
      if (memory.batteryTrend === 'rising') {
        logger.info('OPERATIONAL_CONSCIOUSNESS', 'ignoring_battery_situation trend=rising');
        return null;
      }
    }

    if (situation.source === 'battery' && situation.description.includes('temperature')) {
      // If temperature is falling, maybe we don't need critical action yet
      if (memory.temperatureTrend === 'falling' && situation.importance !== OperationalImportance.CRITICAL) {
        logger.info('OPERATIONAL_CONSCIOUSNESS', 'ignoring_temp_situation trend=falling');
        return null;
      }
    }

    // Adapt decision based on active Cognitive Mode
    const decisionType = CognitiveModeAdapter.adapt(situation, activeMode);
    
    if (decisionType === OperationalDecisionType.NO_ACTION) {
      return null;
    }

    if (this.isDecisionOnCooldown(decisionType)) {
      return null;
    }

    const reason = `Mode: ${activeMode} | Situation: ${situation.description} | BatteryTrend: ${memory.batteryTrend}`;

    return {
      id: `dec_${Date.now()}`,
      type: decisionType,
      situationId: situation.id,
      reason,
      timestamp: Date.now()
    };
  }

  private isDecisionOnCooldown(type: OperationalDecisionType): boolean {
    const lastTime = this.lastDecisionAt[type];
    return (Date.now() - lastTime) < this.DECISION_COOLDOWN;
  }

  private dispatchDecision(decision: OperationalDecision): void {
    this.lastDecisionAt[decision.type] = Date.now();
    logger.info('OPERATIONAL_CONSCIOUSNESS', `decision_dispatched type=${decision.type} reason=${decision.reason}`);

    // Map decision to Action Executor payload
    const actionPayload = this.mapDecisionToAction(decision);
    if (actionPayload) {
      void actionExecutorEngine.execute(actionPayload);
    }
  }

  private mapDecisionToAction(decision: OperationalDecision): any {
    switch (decision.type) {
      case OperationalDecisionType.ENTER_POWER_SAVE_MODE:
        return {
          category: 'runtime',
          type: 'set_power_saving',
          payload: { enabled: true, reason: decision.reason },
          id: decision.id
        };
      case OperationalDecisionType.REDUCE_BACKGROUND_ACTIVITY:
        return {
          category: 'runtime',
          type: 'set_calm_mode',
          payload: { enabled: true, reason: decision.reason },
          id: decision.id
        };
      case OperationalDecisionType.PRESERVE_NETWORK_USAGE:
        return {
          category: 'runtime',
          type: 'set_calm_mode',
          payload: { enabled: true, networkPreserve: true, reason: decision.reason },
          id: decision.id
        };
      default:
        return null;
    }
  }
}

export const operationalConsciousnessEngine = OperationalConsciousnessEngine.getInstance();
