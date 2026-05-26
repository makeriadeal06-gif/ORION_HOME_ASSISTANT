import { useCognitiveStore } from '../state/useCognitiveStore';
import { CognitiveSuggestion, CognitiveState } from '../types';
import { logger } from '../../logger/Logger';

export class SuggestionEngine {
  private static lastSuggestionTime = 0;
  private static COOLDOWN = 300000; // 5 minutes safety cooldown

  public static generate(title: string, description: string, action: any) {
    const now = Date.now();
    if (now - this.lastSuggestionTime < this.COOLDOWN) return;

    useCognitiveStore.getState().setState(CognitiveState.THINKING);

    const suggestion: CognitiveSuggestion = {
      id: `sug_${Math.random().toString(36).substr(2, 9)}`,
      type: 'ACTION',
      title,
      description,
      confidence: 0.85,
      action,
      timestamp: now
    };

    useCognitiveStore.getState().addSuggestion(suggestion);
    this.lastSuggestionTime = now;
    
    logger.info('COGNITIVE_RUNTIME', `New Suggestion Generated: ${title}`);
    
    setTimeout(() => {
      useCognitiveStore.getState().setState(CognitiveState.OBSERVING);
    }, 2000);
  }
}
