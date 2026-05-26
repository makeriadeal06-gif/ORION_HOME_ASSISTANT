import { useCognitiveStore } from '../state/useCognitiveStore';
import { deviceRegistry } from '../../google-home/registry/OrionDeviceRegistry';
import { triggerManager } from '../../runtime/TriggerManager';
import { socketRuntime } from '../../socket/SocketRuntime';
import { mqttManager } from '../../runtime/MqttManager';
import { authManager } from '../../auth/runtime/AuthManager';
import { logger } from '../../logger/Logger';
import { cognitiveMemory } from '../memory/CognitiveMemoryLayer';
import { cognitiveEventBus } from '../bus/CognitiveEventBus';

export class ContextAwarenessEngine {
  private static interval: any = null;

  public static start() {
    if (this.interval) return;
    
    logger.info('COGNITIVE_RUNTIME', 'Context Awareness Engine Online');
    
    this.interval = setInterval(() => {
      this.analyzeContext();
    }, 30000); // Analyze every 30 seconds (Calm Mode)
    
    // Initial analysis
    setTimeout(() => this.analyzeContext(), 2000);
  }

  private static async analyzeContext() {
    // Generate context passively without changing engine state aggressively
    const devices = deviceRegistry.getAllDevices();
    const onlineDevices = devices.filter(d => d.status === 'ONLINE');
    const active = onlineDevices.filter(d => d.activity === 'ACTIVE');
    const isOccupied = active.length > 0;
    
    const triggers = triggerManager.getDevices();
    
    const hour = new Date().getHours();
    let timeContext: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT' = 'MORNING';
    if (hour >= 12 && hour < 18) timeContext = 'AFTERNOON';
    else if (hour >= 18 && hour < 23) timeContext = 'EVENING';
    else if (hour >= 23 || hour < 6) timeContext = 'NIGHT';

    const roomActivity: Record<string, number> = {};
    active.forEach(d => {
      if (d.room) roomActivity[d.room] = (roomActivity[d.room] || 0) + 1;
    });
    const dominantRoom = Object.entries(roomActivity).sort((a, b) => b[1] - a[1])[0]?.[0];

    // Resolve auth state safely — isAuthenticated is a getter, not a method
    let authState = false;
    try {
      authState = authManager?.isAuthenticated === true;
      if (authState) {
        logger.info('CONTEXT', 'auth state resolved authenticated=true');
      } else {
        logger.info('CONTEXT', 'auth state resolved authenticated=false');
      }
    } catch (e) {
      logger.info('CONTEXT', 'auth unavailable fallback applied');
      authState = false;
    }

    // Lightweight media / focus detection (presentation-safe)
    let playbackActive = false;
    let mediaSessionState: 'playing' | 'paused' | 'none' | null = null;
    let lastMediaSource: string | null = null;

    try {
      // navigator.mediaSession is optional and provides metadata/state
      const ms: any = (navigator as any).mediaSession;
      if (ms) {
        mediaSessionState = (ms.playbackState as any) || null;
        if (mediaSessionState === 'playing') playbackActive = true;
        // Best-effort metadata
        lastMediaSource = ms.metadata?.title || ms.metadata?.artist || null;
      }
    } catch (e) {
      // ignore - non-critical
    }

    // Page focus / fullscreen heuristics
    const focusActive = (typeof document !== 'undefined') ? document.visibilityState === 'visible' && document.hasFocus() : false;
    const fullscreenApp = (typeof document !== 'undefined' && document.fullscreenElement) ? (typeof window !== 'undefined' ? window.location.pathname : null) : null;
    const foregroundApp = (typeof window !== 'undefined') ? window.location.pathname : 'dashboard';

    // Behavior mode derivation (non-authoritative, presentation-only)
    let behaviorMode: 'AMBIENT' | 'FOCUS' | 'MEDIA_ACTIVE' | 'NIGHT' | 'IDLE' | 'AUTO' = 'AUTO';
    if (timeContext === 'NIGHT') behaviorMode = 'NIGHT';
    else if (playbackActive) behaviorMode = 'MEDIA_ACTIVE';
    else if (!focusActive) behaviorMode = 'AMBIENT';
    else if (focusActive && !playbackActive) behaviorMode = 'FOCUS';

    // New context snapshot
    const contextSnapshot = {
      activeDevicesCount: active.length,
      runtimeStatus: 'OPERATIONAL',
      socketStatus: socketRuntime.getStatus(),
      mqttStatus: (typeof mqttManager.getState === 'function' ? mqttManager.getState() : 'DISCONNECTED') === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      availableTriggersCount: triggers.length,
      recentActivity: active.length > 0 ? `ACTIVE_NODES_${active.length}` : 'IDLE_STATE',
      lastCommand: cognitiveMemory.getMemorySnapshot().lastIntentId,
      isUserAuthenticated: authState,

      // Legacy
      isHomeOccupied: isOccupied,
      timeContext,
      dominantRoom,
      loadLevel: (active.length / Math.max(onlineDevices.length, 1)) * 100,
      lastEvent: active.length > 0 ? `ACTIVE_NODES_${active.length}` : 'IDLE_STATE',

      // Extended (volatile)
      playbackActive,
      mediaSessionState,
      lastMediaSource,
      focusActive,
      fullscreenApp,
      foregroundApp,
      behaviorMode
    };

    useCognitiveStore.getState().updateContext(contextSnapshot);
    cognitiveMemory.recordContextSnapshot(contextSnapshot);
    cognitiveEventBus.emit('cognition:context_updated', contextSnapshot);

    try {
      const { ProductionRecoveryEngine } = await import('../../production/recovery/ProductionRecoveryEngine');
      ProductionRecoveryEngine.ping('COGNITIVE_CORE');
    } catch (e) {
      // Dynamic import safety
    }
  }

  public static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
