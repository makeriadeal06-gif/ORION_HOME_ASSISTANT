export type AutomationType = 'TIME_BASED' | 'VOICE_TRIGGERED' | 'SYSTEM_TRIGGERED' | 'MANUAL' | 'FUTURE_DEVICE_TRIGGER';

export type AutomationState = 'idle' | 'waiting' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type AutomationDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type AutomationSystemTrigger = 'startup' | 'recovery' | 'socket_disconnected' | 'app_opened' | 'reconnect';

export type FutureDeviceTriggerKind = 'wifi_device_online' | 'bluetooth_device_detected' | 'smart_device_state' | 'sensor_state';

export type AutomationLifecycleCondition = 'active' | 'background' | 'recovering';

export type AutomationCondition =
  | {
      id: string;
      type: 'time_window';
      label: string;
      startTime: string;
      endTime: string;
    }
  | {
      id: string;
      type: 'day';
      label: string;
      days: AutomationDay[];
    }
  | {
      id: string;
      type: 'lifecycle';
      label: string;
      lifecycle: AutomationLifecycleCondition;
    }
  | {
      id: string;
      type: 'socket_connected';
      label: string;
      expected: boolean;
    }
  | {
      id: string;
      type: 'user_active';
      label: string;
      expected: boolean;
    }
  | {
      id: string;
      type: 'focus_mode_active';
      label: string;
      expected: boolean;
    };

export type AutomationAction =
  | {
      id: string;
      kind: 'LOCAL_COMMAND';
      label: string;
      command: 'open_app' | 'open_url' | 'execute_local_command' | 'performance_mode' | 'focus_mode';
      appTarget?: string;
      url?: string;
      commandText?: string;
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'WAIT_ACTION';
      label: string;
      durationMs: number;
    }
  | {
      id: string;
      kind: 'VOICE_ACTION';
      label: string;
      speechText: string;
      requireConfirmation?: boolean;
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'SYSTEM_ACTION';
      label: string;
      action: 'runtime_socket_reconnect' | 'runtime_hydration_revalidate' | 'runtime_restart_listening' | 'runtime_interrupt_playback';
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'TASK_ACTION';
      label: string;
      targetAutomationId: string;
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'TRIGGERCMD_ACTION';
      label: string;
      deviceId: string;
      action: string;
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'EXECUTABLE_PATH_ACTION';
      label: string;
      executablePath: string;
      category: string;
      icon?: string;
      registryId?: string;
      provider: 'system_bridge' | 'triggercmd';
      delayMs?: number;
    }
  | {
      id: string;
      kind: 'FUTURE_DEVICE_ACTION';
      label: string;
      action: 'wifi_device_command' | 'smart_light_toggle' | 'smart_scene_activate';
      targetId?: string;
      value?: string;
      delayMs?: number;
    };

export type AutomationTrigger =
  | {
      type: 'TIME_BASED';
      scheduleMode: 'fixed_time' | 'interval' | 'one_shot';
      time: string;
      intervalMinutes: number | null;
      delayMs: number | null;
      oneShotAt?: number | null;
      activeDays: AutomationDay[];
      recurrence: 'daily' | 'weekdays' | 'weekend' | 'custom' | 'once';
      timezone?: string;
    }
  | {
      type: 'VOICE_TRIGGERED';
      phrase: string;
      aliases: string[];
      sensitivity: 'low' | 'medium' | 'high';
    }
  | {
      type: 'SYSTEM_TRIGGERED';
      event: AutomationSystemTrigger;
    }
  | {
      type: 'MANUAL';
    }
  | {
      type: 'FUTURE_DEVICE_TRIGGER';
      event: FutureDeviceTriggerKind;
      targetId: string;
      expectedState: string;
    };

export interface AutomationScheduleSettings {
  retries: number;
  cooldownMs: number;
  priority: number;
  requireConfirmation: boolean;
  repeatEnabled: boolean;
  activeWindowStart?: string | null;
  activeWindowEnd?: string | null;
  weeklyExecutionLimit?: number | null;
}

export interface AutomationRecord {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  type: AutomationType;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  schedule: AutomationScheduleSettings;
  createdAt: number;
  updatedAt: number;
  state: AutomationState;
  nextExecutionAt: number | null;
  lastExecutionAt: number | null;
  lastCompletedAt: number | null;
  lastFailedAt: number | null;
  lastCancelledAt: number | null;
  lastError: string | null;
  activeTaskIds: string[];
  historyTaskIds: string[];
  continuity: {
    dedupeKey: string;
    ownershipLock: string | null;
    restoreCount: number;
    recoveryCount: number;
    lastHydratedAt: number | null;
    lastEventKey: string | null;
    corruptedRecovered: boolean;
    executionHistory: number[];
    metrics: {
      totalExecutions: number;
      successfulExecutions: number;
      failedExecutions: number;
      retryCount: number;
      averageExecutionTimeMs: number;
      lastExecutionDurationMs: number | null;
      orphanRecoveries: number;
      skippedExecutions: number;
      cooldownBlocks: number;
    };
  };
}

export interface AutomationSnapshot {
  version: 2;
  runtimeId: string;
  ownerId: string;
  runtimeSessionId: string;
  runtimeDeviceId?: string;
  updatedAt: number;
  automations: AutomationRecord[];
}

export interface AutomationDraft {
  id: string;
  mode: 'create' | 'edit';
  automationId: string | null;
  dirty: boolean;
  updatedAt: number;
  data: Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'>;
}

export interface AutomationStoreState {
  hydrated: boolean;
  loading: boolean;
  automations: AutomationRecord[];
  draft: AutomationDraft | null;
  editorOpen: boolean;
}

export function createDefaultAutomationTemplate(ownerId: string) {
  return {
    ownerId,
    name: '',
    description: '',
    type: 'MANUAL' as AutomationType,
    enabled: true,
    trigger: { type: 'MANUAL' } as AutomationTrigger,
    conditions: [] as AutomationCondition[],
    actions: [] as AutomationAction[],
    schedule: {
      retries: 1,
      cooldownMs: 0,
      priority: 1,
      requireConfirmation: false,
      repeatEnabled: false,
      activeWindowStart: null,
      activeWindowEnd: null,
      weeklyExecutionLimit: null,
    },
  };
}
