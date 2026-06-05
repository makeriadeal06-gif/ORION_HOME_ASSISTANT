import { logger } from '../../logger/Logger';
import { autonomyEngine } from '../autonomy/AutonomyEngine';
import { DecisionCandidate, DecisionResult, PriorityLevel } from './types';

/**
 * DECISION ENGINE
 * 
 * Orchestrates multiple operational situations, filters them by priority,
 * and selects the optimal action to execute.
 */
// FREEZE_PHASE_14_CONTROLLED_AUTONOMY
class DecisionEngine {
  private static instance: DecisionEngine;

  private constructor() {}

  public static getInstance(): DecisionEngine {
    if (!DecisionEngine.instance) {
      DecisionEngine.instance = new DecisionEngine();
    }
    return DecisionEngine.instance;
  }

  /**
   * Receives multiple operational candidates, prioritizes them,
   * and chooses the best action to execute.
   */
  public async decide(candidates: DecisionCandidate[]): Promise<DecisionResult> {
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    if (candidates.length === 0) {
      return {
        selected: null,
        rejected: [],
        timestamp: Date.now()
      };
    }

    logger.info('DECISION_ENGINE', `Processing ${candidates.length} candidates...`);

    // Decision Scoring and Prioritization
    const scored = candidates.map(candidate => ({
      candidate,
      score: this.calculateScore(candidate)
    }));

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    const selected = scored[0].candidate;
    const rejected = scored.slice(1).map(s => s.candidate);

    // Logging as requested
    logger.info('DECISION_PRIORITY', `Selected Candidate: ${selected.id} | Priority: ${selected.priority} | Score: ${scored[0].score}`);
    logger.info('DECISION_SELECTED', `Action: ${selected.action.type} | Source: ${selected.source} | Reason: ${selected.reason}`);

    if (rejected.length > 0) {
      logger.info('DECISION_REJECTED', `Rejected count: ${rejected.length}`);
      rejected.forEach(r => {
        logger.info('DECISION_REJECTED', `Rejected candidate: ${r.id} | Priority: ${r.priority}`);
      });
    }

    // Delegate to Autonomy Engine to decide HOW to execute
    // FREEZE_PHASE_14_CONTROLLED_AUTONOMY
    void autonomyEngine.process(selected);

    return {
      selected,
      rejected,
      timestamp: Date.now()
    };
  }

  /**
   * Internal scoring logic based on priority and context rules.
   */
  private calculateScore(candidate: DecisionCandidate): number {
    let score = 0;

    // 1. Base score from PriorityLevel
    switch (candidate.priority) {
      case PriorityLevel.CRITICAL:
        score += 1000;
        break;
      case PriorityLevel.HIGH:
        score += 750;
        break;
      case PriorityLevel.MEDIUM:
        score += 500;
        break;
      case PriorityLevel.LOW:
        score += 250;
        break;
    }

    // 2. Rule-based scoring adjustments
    const reasonLower = candidate.reason.toLowerCase();
    const sourceLower = candidate.source.toLowerCase();

    // Rule: Temperatura crítica -> prioridade máxima
    if (reasonLower.includes('temperature') || sourceLower.includes('temp')) {
      if (candidate.priority === PriorityLevel.CRITICAL) {
        score += 100;
      }
    }

    // Rule: Bateria crítica -> segunda prioridade
    if (reasonLower.includes('battery') || sourceLower.includes('battery')) {
      if (candidate.priority === PriorityLevel.HIGH) {
        score += 50;
      }
    }

    // Rule: Falha de conectividade -> terceira prioridade
    if (reasonLower.includes('connectivity') || reasonLower.includes('network failure')) {
      score += 25;
    }

    // Rule: Economia de dados -> quarta prioridade
    if (reasonLower.includes('data saving') || reasonLower.includes('metered')) {
      score += 10;
    }

    // Rule: Eventos informativos -> handled by base score

    return score;
  }
}

export const decisionEngine = DecisionEngine.getInstance();
