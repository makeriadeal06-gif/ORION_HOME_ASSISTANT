export type ActionCategory = 'android' | 'runtime' | 'automation';

export interface BaseAction {
  category: ActionCategory;
  type: string;
  payload?: Record<string, unknown>;
  id?: string;
}

// 1. Android Actions (Sent to Native Bridge)
export interface AndroidAction extends BaseAction {
  category: 'android';
  type: 'open_app' | 'close_app' | 'open_settings' | 'custom_intent';
  payload?: {
    packageName?: string;
    action?: string;
    uri?: string;
    [key: string]: unknown;
  };
}

// 2. Runtime Actions (Local state changes)
export interface RuntimeAction extends BaseAction {
  category: 'runtime';
  type: 'set_calm_mode' | 'set_power_saving' | 'set_profile';
  payload?: {
    enabled?: boolean;
    profileId?: string;
    [key: string]: unknown;
  };
}

// 3. Automation Actions (TriggerCMD, Google Home, Tasks)
export interface AutomationAction extends BaseAction {
  category: 'automation';
  type: 'trigger_cmd' | 'google_home_action' | 'internal_task';
  payload?: {
    commandId?: string;
    deviceId?: string;
    actionName?: string;
    taskId?: string;
    [key: string]: unknown;
  };
}

export type ActionPayload = AndroidAction | RuntimeAction | AutomationAction;

export interface ExecutionResult {
  success: boolean;
  actionId: string;
  error?: string;
  timestamp: number;
}

export interface ActionHandler {
  canHandle(action: ActionPayload): boolean;
  execute(action: ActionPayload): Promise<ExecutionResult>;
}
