import { useDeviceStore } from '../../google-home/state/useDeviceStore';
import { SuggestionEngine } from '../suggestions/SuggestionEngine';
import { logger } from '../../logger/Logger';
import { CommandType } from '../../command-runtime/types';
import { ProductionRecoveryEngine } from '../../production/recovery/ProductionRecoveryEngine';

export class BehaviorPatternEngine {
  private static initialized = false;
  private static interval: any;

  public static init() {
    if (this.initialized) return;
    
    logger.info('COGNITIVE_RUNTIME', 'Behavior Pattern Engine Active [CALM_MODE]');

    // Subscribe to device store changes to detect patterns
    useDeviceStore.subscribe((state, prevState) => {
      this.analyzeTransitions(state.devices, prevState.devices);
    });

    this.startHeartbeat();
    this.initialized = true;
  }

  private static startHeartbeat() {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      ProductionRecoveryEngine.ping('COGNITIVE_CORE');
    }, 60000); // 60s heartbeat for cognitive core
  }

  private static analyzeTransitions(current: any, previous: any) {
    // Example Pattern: If TV becomes ACTIVE in the evening, suggest Ambient Lighting
    const tv = Object.values(current).find((d: any) => d.type === 'TV' && d.activity === 'ACTIVE');
    const wasTvActive = previous && Object.values(previous).find((d: any) => d.type === 'TV' && d.activity === 'ACTIVE');

    if (tv && !wasTvActive) {
      const hour = new Date().getHours();
      if (hour >= 18 && hour < 23) {
        SuggestionEngine.generate(
          'Evening Cinema Mode',
          'TV detected active. Adjust ambient lighting for better experience?',
          { type: CommandType.GOOGLE_HOME, deviceId: 'gh_light_01', payload: { brightness: 20 } }
        );
      }
    }
  }
}
