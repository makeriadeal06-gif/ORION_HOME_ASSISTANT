import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageKey, getScopedStorageValue, removeScopedStorageValue } from '@core/runtime/ScopedBrowserStorage';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';
import { PersistentTask } from '@core/task-runtime/types';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import { useAutomationStore } from '@core/state/stores/useAutomationStore';
import { CommandType } from '@core/command-runtime/types';
import { socketRuntime } from '@core/socket/SocketRuntime';
import { isExecutablePathValid } from './AutomationAssetRegistry';
import {
  AutomationAction,
  AutomationCondition,
  AutomationDay,
  AutomationDraft,
  AutomationRecord,
  AutomationSnapshot,
  AutomationStoreState,
  AutomationSystemTrigger,
  AutomationTrigger,
  createDefaultAutomationTemplate,
} from './types';

const STORAGE_KEY = 'orion.automation.snapshot.v2';
const STORAGE_BACKUP_KEY = 'orion.automation.snapshot.backup.v2';
const DRAFT_STORAGE_KEY = 'orion.automation.editor.draft.v1';
const SEED_STATE_STORAGE_KEY = 'orion.automation.seed-state.v1';
const SNAPSHOT_VERSION = 2;

type RuntimeContextDetail = {
  type: string;
  action: string;
  payload?: Record<string, unknown>;
};

class AutomationStoreService {
  private static instance: AutomationStoreService;

  private initialized = false;
  private runtimeId = `automation_store_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  private checksum = '';
  private automations = new Map<string, AutomationRecord>();
  private lastTaskSnapshot: PersistentTask[] = [];
  private contextListenerAttached = false;
  private authListenerAttached = false;
  private taskSubscriptionDisposer: (() => void) | null = null;
  private draftPersistTimer: number | null = null;
  private restoredSnapshotPresent = false;
  private seedState = new Set<string>();
  private currentOwnerId: string | null = null;
  private currentRuntimeSessionId = '';
  private hydrationLocked = false;

  public static getInstance(): AutomationStoreService {
    if (!AutomationStoreService.instance) {
      AutomationStoreService.instance = new AutomationStoreService();
    }
    return AutomationStoreService.instance;
  }

  public init(): void {
    if (this.initialized) {
      logger.warn('AUTOMATION_INTEGRITY', `init_blocked duplicate=true runtime=${this.runtimeId}`);
      return;
    }

    this.initialized = true;
    this.currentOwnerId = runtimeIdentity.getOwnerId();
    this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
    this.seedState = this.restoreSeedState();
    useAutomationStore.getState().setLoading(true);
    logger.info('AUTOMATION_HYDRATION', `init_started runtime=${this.runtimeId}`);
    this.restoreSnapshot();
    this.restoreDraft();
    this.attachTaskRuntime();
    this.attachContextListener();
    this.attachAuthListener();
    this.reconcileAutomations('init');
    this.notifyUi('init');
    this.dispatchContext('startup');
    logger.info('AUTOMATION_RUNTIME', `initialized runtime=${this.runtimeId} automations=${this.automations.size}`);
  }

  public getState(): AutomationStoreState {
    return useAutomationStore.getState();
  }

  public getAutomationById(automationId: string): AutomationRecord | null {
    return this.cloneAutomation(this.automations.get(automationId) || null);
  }

  public listAutomations(): AutomationRecord[] {
    return Array.from(this.automations.values()).map((automation) => this.cloneAutomation(automation)!);
  }

  public createDraft(mode: 'create' | 'edit', automationId?: string | null): AutomationDraft | null {
    const ownerId = useAuthStore.getState().user?.uid;
    if (!ownerId || !runtimeIdentity.requiresPersistentExecution('automation_create_draft')) {
      return null;
    }

    const editorOpen = useAutomationStore.getState().editorOpen;
    if (editorOpen) {
      logger.warn('AUTOMATION_INTEGRITY', 'duplicate_modal_guard blocked=true');
      return useAutomationStore.getState().draft;
    }

    const source = automationId ? this.automations.get(automationId) : null;
    const data = source
      ? this.extractMutableDraftData(source)
      : createDefaultAutomationTemplate(ownerId);

    const draft: AutomationDraft = {
      id: `draft_${Math.random().toString(36).slice(2)}_${Date.now()}`,
      mode,
      automationId: source?.id || null,
      dirty: false,
      updatedAt: Date.now(),
      data,
    };

    useAutomationStore.getState().setDraft(draft);
    useAutomationStore.getState().setEditorOpen(true);
    this.persistDraft(draft);
    logger.info('AUTOMATION_EDITOR', `draft_opened mode=${mode} automationId=${automationId || 'new'}`);
    return draft;
  }

  public updateDraft(draft: AutomationDraft): void {
    const nextDraft = {
      ...draft,
      dirty: true,
      updatedAt: Date.now(),
      data: this.normalizeMutableData(draft.data, true),
    };
    useAutomationStore.getState().setDraft(nextDraft);
    this.persistDraft(nextDraft, true);
    logger.info('AUTOMATION_BUILDER', `draft_updated mode=${draft.mode} automationId=${draft.automationId || 'new'}`);
  }

  public closeDraft(force = false): boolean {
    const draft = useAutomationStore.getState().draft;
    if (draft?.dirty && !force) {
      logger.warn('AUTOMATION_EDITOR', 'unsaved_changes_guard blocked=true');
      return false;
    }

    useAutomationStore.getState().setDraft(null);
    useAutomationStore.getState().setEditorOpen(false);
    if (this.draftPersistTimer) {
      window.clearTimeout(this.draftPersistTimer);
      this.draftPersistTimer = null;
    }
    if (force || !draft?.dirty) {
      removeScopedStorageValue(DRAFT_STORAGE_KEY, this.currentOwnerId);
    }
    logger.info('AUTOMATION_EDITOR', `draft_closed force=${force}`);
    return true;
  }

  public saveDraft(draftOverride?: AutomationDraft | null): AutomationRecord | null {
    const draft = draftOverride || useAutomationStore.getState().draft;
    const ownerId = useAuthStore.getState().user?.uid;
    if (!draft || !ownerId || !runtimeIdentity.requiresPersistentExecution('automation_save_draft')) {
      return null;
    }

    const data = this.normalizeMutableData(draft.data, false);
    if (!data.name.trim()) {
      logger.warn('AUTOMATION_EDITOR', 'save_blocked reason=missing_name');
      return null;
    }
    if (data.actions.length === 0) {
      logger.warn('AUTOMATION_EDITOR', 'save_blocked reason=no_actions');
      return null;
    }
    if (!this.validateActions(data.actions)) {
      logger.warn('AUTOMATION_EDITOR', 'save_blocked reason=invalid_actions');
      return null;
    }

    let automation: AutomationRecord | null;
    if (draft.mode === 'edit' && draft.automationId && this.automations.has(draft.automationId)) {
      automation = this.commitAutomationUpdate(draft.automationId, data);
    } else {
      automation = this.commitNewAutomation({
        ...data,
        ownerId,
      });
    }

    if (!automation) {
      return null;
    }

    this.markOwnerInitialized(automation.ownerId);
    if (this.draftPersistTimer) {
      window.clearTimeout(this.draftPersistTimer);
      this.draftPersistTimer = null;
    }
    removeScopedStorageValue(DRAFT_STORAGE_KEY, this.currentOwnerId);
    useAutomationStore.getState().setDraft(null);
    useAutomationStore.getState().setEditorOpen(false);
    this.reconcileAutomations('draft_save');
    this.persistSnapshot('draft_save');
    this.notifyUi('draft_save');
    logger.info('AUTOMATION_EDITOR', `draft_saved automationId=${automation.id}`);
    return automation;
  }

  public createAutomation(input: Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'>): AutomationRecord | null {
    if (!runtimeIdentity.requiresPersistentExecution('automation_create') || !runtimeIdentity.requiresExecutionPermission('automation_create', input.ownerId)) {
      return null;
    }

    const automation = this.commitNewAutomation(input);
    if (!automation) {
      return null;
    }
    this.markOwnerInitialized(automation.ownerId);
    this.reconcileAutomations('create');
    this.persistSnapshot('create');
    this.notifyUi('create');
    logger.info('AUTOMATION_RUNTIME', `created automationId=${automation.id} type=${automation.type}`);
    return automation;
  }

  public updateAutomation(automationId: string, updates: Partial<AutomationRecord>): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) {
      return false;
    }

    const next = this.normalizeAutomationRecord({
      ...automation,
      ...updates,
      updatedAt: Date.now(),
    });
    this.automations.set(automationId, next);
    this.reconcileAutomations('update');
    this.persistSnapshot('update');
    this.notifyUi('update');
    logger.info('AUTOMATION_RUNTIME', `updated automationId=${automationId}`);
    return true;
  }

  public duplicateAutomation(automationId: string): AutomationRecord | null {
    const source = this.automations.get(automationId);
    if (!source) {
      return null;
    }

    const automation = this.commitNewAutomation({
      ...this.extractMutableDraftData(source),
      ownerId: source.ownerId,
      name: `${source.name} Copy`,
    });
    if (!automation) {
      return null;
    }
    this.markOwnerInitialized(automation.ownerId);
    this.reconcileAutomations('duplicate');
    this.persistSnapshot('duplicate');
    this.notifyUi('duplicate');
    logger.info('AUTOMATION_EDITOR', `automation_duplicated source=${automationId} duplicate=${automation.id}`);
    return automation;
  }

  public deleteAutomation(automationId: string): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) {
      return false;
    }
    for (const taskId of automation.activeTaskIds) {
      taskRuntime.cancelTask(taskId);
    }
    this.automations.delete(automationId);
    this.markOwnerInitialized(automation.ownerId);
    this.persistSnapshot('delete');
    this.notifyUi('delete');
    logger.warn('AUTOMATION_RUNTIME', `deleted automationId=${automationId}`);
    return true;
  }

  public toggleAutomation(automationId: string, enabled: boolean): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) {
      return false;
    }

    automation.enabled = enabled;
    automation.state = enabled ? 'idle' : 'paused';
    automation.updatedAt = Date.now();
    if (!enabled) {
      for (const taskId of automation.activeTaskIds) {
        taskRuntime.pauseTask(taskId);
      }
    }
    this.reconcileAutomations('toggle');
    this.persistSnapshot('toggle');
    this.notifyUi('toggle');
    logger.info('AUTOMATION_RUNTIME', `toggle automationId=${automationId} enabled=${enabled}`);
    return true;
  }

  public runAutomation(automationId: string, reason = 'manual'): boolean {
    const automation = this.automations.get(automationId);
    if (!automation || !automation.enabled || !runtimeIdentity.automationOwnershipGuard('automation_run', {
      ownerId: automation.ownerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    })) {
      return false;
    }
    return this.dispatchAutomation(automation, reason);
  }

  public pauseAutomationTasks(automationId: string): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) {
      return false;
    }
    let changed = false;
    for (const taskId of automation.activeTaskIds) {
      changed = taskRuntime.pauseTask(taskId) || changed;
    }
    automation.state = 'paused';
    automation.updatedAt = Date.now();
    this.persistSnapshot('pause');
    this.notifyUi('pause');
    return changed;
  }

  public resumeAutomationTasks(automationId: string): boolean {
    const automation = this.automations.get(automationId);
    if (!automation) {
      return false;
    }
    let changed = false;
    for (const taskId of automation.activeTaskIds) {
      changed = taskRuntime.resumeTask(taskId) || changed;
    }
    automation.state = automation.enabled ? 'waiting' : 'paused';
    automation.updatedAt = Date.now();
    this.persistSnapshot('resume');
    this.notifyUi('resume');
    return changed;
  }

  public matchVoiceTriggeredAutomation(text: string, ownerId: string | null): AutomationRecord | null {
    if (!ownerId) {
      return null;
    }

    const normalized = text.trim().toLowerCase();
    for (const automation of this.automations.values()) {
      if (!automation.enabled || automation.ownerId !== ownerId || automation.trigger.type !== 'VOICE_TRIGGERED') {
        continue;
      }

      const trigger = automation.trigger;
      const phrases = [trigger.phrase, ...trigger.aliases].map((entry) => entry.trim().toLowerCase()).filter(Boolean);
      const matched = phrases.find((entry) => entry === normalized || (trigger.sensitivity !== 'low' && normalized.includes(entry)));
      if (matched) {
        logger.info('AUTOMATION_TRIGGER', `voice_match automationId=${automation.id} phrase=${matched}`);
        return this.cloneAutomation(automation);
      }
    }

    return null;
  }

  private attachTaskRuntime(): void {
    this.taskSubscriptionDisposer = taskRuntime.subscribe((tasks) => {
      this.lastTaskSnapshot = tasks;
      this.syncFromTasks(tasks);
    });
  }

  private attachContextListener(): void {
    if (this.contextListenerAttached) {
      return;
    }
    this.contextListenerAttached = true;
    window.addEventListener('orion:runtime-context', ((event: Event) => {
      const detail = (event as CustomEvent<RuntimeContextDetail>).detail;
      if (detail) {
        this.handleContext(detail);
      }
    }) as EventListener);
  }

  private attachAuthListener(): void {
    if (this.authListenerAttached) {
      return;
    }
    this.authListenerAttached = true;
    let previousOwnerId = this.currentOwnerId;
    let previousAuthState = useAuthStore.getState().state;
    useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      const nextAuthState = state.state;

      if (nextAuthState === 'AUTHENTICATING' || nextAuthState === 'RESTORING_SESSION') {
        this.hydrationLocked = true;
        useAutomationStore.getState().setLoading(true);
        useAutomationStore.getState().setHydrated(false);
        logger.info('AUTH_TRANSITION', `automation_hydration_locked=true auth=${nextAuthState} owner=${nextOwnerId || previousOwnerId || 'preview'}`);
        previousAuthState = nextAuthState;
        return;
      }

      if (nextOwnerId !== previousOwnerId) {
        this.handleOwnerChange(previousOwnerId, nextOwnerId);
        previousOwnerId = nextOwnerId;
      } else if (this.hydrationLocked) {
        this.hydrationLocked = false;
        this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
        this.reconcileAutomations('auth_resume');
        this.notifyUi('auth_resume');
        logger.info('HYDRATION_RUNTIME', `automation_hydration_resumed owner=${nextOwnerId || 'preview'} auth=${nextAuthState}`);
      }
      previousAuthState = nextAuthState;
    });
  }

  private handleOwnerChange(previousOwnerId: string | null, nextOwnerId: string | null): void {
    logger.info('SESSION_ISOLATION', `automation_owner_change prev=${previousOwnerId || 'preview'} next=${nextOwnerId || 'preview'}`);
    this.automations.clear();
    this.lastTaskSnapshot = [];
    this.checksum = '';
    this.restoredSnapshotPresent = false;
    this.hydrationLocked = false;
    this.currentOwnerId = nextOwnerId;
    this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
    useAutomationStore.getState().setDraft(null);
    useAutomationStore.getState().setEditorOpen(false);
    this.seedState = this.restoreSeedState();
    this.restoreSnapshot();
    this.restoreDraft();
    this.reconcileAutomations('owner_change');
    this.notifyUi('owner_change');
  }

  private handleContext(detail: RuntimeContextDetail): void {
    const eventName = this.mapContextToSystemTrigger(detail);
    if (!eventName) {
      return;
    }
    logger.info('AUTOMATION_HYDRATION', `context_event type=${detail.type} action=${detail.action} mapped=${eventName}`);
    this.dispatchContext(eventName);
  }

  private dispatchContext(eventName: AutomationSystemTrigger): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('automation_dispatch_context')) {
      logger.info('PREVIEW_RUNTIME', `automation_dispatch_skipped reason=${eventName}`);
      return;
    }

    const now = Date.now();
    for (const automation of this.automations.values()) {
      if (!automation.enabled || automation.trigger.type !== 'SYSTEM_TRIGGERED' || automation.trigger.event !== eventName) {
        continue;
      }
      const eventKey = `${automation.id}:${eventName}:${Math.floor(now / 5000)}`;
      if (automation.continuity.lastEventKey === eventKey) {
        logger.warn('AUTOMATION_INTEGRITY', `duplicate_event_guard automationId=${automation.id} event=${eventName}`);
        continue;
      }
      automation.continuity.lastEventKey = eventKey;
      this.dispatchAutomation(automation, eventName);
    }
  }

  private dispatchAutomation(automation: AutomationRecord, reason: string): boolean {
    const now = Date.now();

    if (!runtimeIdentity.automationOwnershipGuard(`automation_dispatch_${reason}`, {
      ownerId: automation.ownerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    })) {
      automation.continuity.metrics.skippedExecutions += 1;
      automation.lastError = 'AUTOMATION_RUNTIME_SCOPE_BLOCKED';
      logger.warn('AUTOMATION_EXECUTION', `ownership_guard_blocked automationId=${automation.id} reason=${reason}`);
      return false;
    }

    if (automation.continuity.ownershipLock) {
      automation.continuity.metrics.skippedExecutions += 1;
      logger.warn('AUTOMATION_INTEGRITY', `ownership_blocked automationId=${automation.id} lock=${automation.continuity.ownershipLock}`);
      logger.info('AUTOMATION_METRICS', `automationId=${automation.id} skipped=${automation.continuity.metrics.skippedExecutions} reason=ownership_lock`);
      return false;
    }

    if (automation.schedule.cooldownMs && automation.lastExecutionAt && now < automation.lastExecutionAt + automation.schedule.cooldownMs) {
      automation.continuity.metrics.cooldownBlocks += 1;
      automation.continuity.metrics.skippedExecutions += 1;
      automation.lastError = 'AUTOMATION_COOLDOWN_ACTIVE';
      logger.warn('AUTOMATION_EXECUTION', `cooldown_blocked automationId=${automation.id}`);
      logger.info('AUTOMATION_METRICS', `automationId=${automation.id} cooldown_blocks=${automation.continuity.metrics.cooldownBlocks} skipped=${automation.continuity.metrics.skippedExecutions}`);
      return false;
    }

    if (!this.evaluateConditions(automation)) {
      automation.continuity.metrics.skippedExecutions += 1;
      automation.lastError = 'AUTOMATION_CONDITIONS_NOT_MET';
      automation.state = 'cancelled';
      automation.updatedAt = Date.now();
      this.persistSnapshot('conditions_blocked');
      this.notifyUi('conditions_blocked');
      logger.warn('AUTOMATION_EXECUTION', `conditions_blocked automationId=${automation.id}`);
      logger.info('AUTOMATION_METRICS', `automationId=${automation.id} skipped=${automation.continuity.metrics.skippedExecutions} reason=conditions`);
      return false;
    }

    if (automation.activeTaskIds.some((taskId) => {
      const task = this.lastTaskSnapshot.find((entry) => entry.taskId === taskId);
      return task !== undefined && ['pending', 'queued', 'running', 'waiting'].includes(task.status);
    })) {
      automation.continuity.metrics.skippedExecutions += 1;
      logger.warn('AUTOMATION_INTEGRITY', `concurrent_execution_guard automationId=${automation.id}`);
      logger.info('AUTOMATION_METRICS', `automationId=${automation.id} skipped=${automation.continuity.metrics.skippedExecutions} reason=concurrent_guard`);
      return false;
    }

    automation.continuity.ownershipLock = this.runtimeId;
    automation.lastExecutionAt = Date.now();
    automation.continuity.executionHistory = [...automation.continuity.executionHistory, automation.lastExecutionAt].slice(-100);
    automation.continuity.metrics.totalExecutions += 1;
    automation.lastError = null;
    automation.updatedAt = Date.now();
    automation.activeTaskIds = [];

    let accumulatedDelayMs = 0;
    const nextTasks: PersistentTask[] = [];
    for (const action of automation.actions) {
      if (action.kind === 'WAIT_ACTION') {
        accumulatedDelayMs += action.durationMs;
        continue;
      }
      const task = this.createActionTask(automation, action, reason, accumulatedDelayMs);
      if (task) {
        nextTasks.push(task);
      }
      if ('delayMs' in action && action.delayMs) {
        accumulatedDelayMs += action.delayMs;
      }
    }

    automation.activeTaskIds = nextTasks.map((task) => task.taskId);
    automation.historyTaskIds = [...new Set([...automation.historyTaskIds, ...automation.activeTaskIds])].slice(-50);
    automation.state = nextTasks.some((task) => task.status === 'waiting') ? 'scheduled' : 'waiting';
    logger.info('AUTOMATION_TASK', `automation_dispatched automationId=${automation.id} tasks=${automation.activeTaskIds.length} reason=${reason}`);
    logger.info('AUTOMATION_METRICS', `automationId=${automation.id} total=${automation.continuity.metrics.totalExecutions} state=${automation.state} tasks=${automation.activeTaskIds.length}`);
    this.persistSnapshot('dispatch');
    this.notifyUi('dispatch');
    return true;
  }

  private createActionTask(automation: AutomationRecord, action: Exclude<AutomationAction, { kind: 'WAIT_ACTION' }>, reason: string, accumulatedDelayMs = 0): PersistentTask | null {
    if (!runtimeIdentity.automationOwnershipGuard('automation_create_action_task', {
      ownerId: automation.ownerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
    })) {
      automation.continuity.metrics.failedExecutions += 1;
      automation.lastError = 'AUTOMATION_USER_NOT_ACTIVE';
      automation.state = 'failed';
      logger.warn('AUTOMATION_INTEGRITY', `owner_mismatch automationId=${automation.id} active=${useAuthStore.getState().user?.uid || 'none'}`);
      logger.info('AUTOMATION_METRICS', `automationId=${automation.id} failed=${automation.continuity.metrics.failedExecutions} reason=owner_mismatch`);
      return null;
    }

    const taskPayload = {
      automationId: automation.id,
      automationName: automation.name,
      triggerUserId: automation.ownerId,
      automationReason: reason,
      actionId: action.id,
    };

    if (action.kind === 'TRIGGERCMD_ACTION') {
      return taskRuntime.createTask({
        ownerId: automation.ownerId,
        userId: automation.ownerId,
        source: `AUTOMATION:${automation.id}`,
        correlationId: `${automation.id}:${action.id}:${Date.now()}`,
        request: {
          type: CommandType.TRIGGER_CMD,
          deviceId: action.deviceId,
          action: action.action,
          payload: taskPayload,
        },
        executeAfterMs: accumulatedDelayMs + (action.delayMs || 0),
        cooldownUntil: automation.schedule.cooldownMs ? Date.now() + automation.schedule.cooldownMs : undefined,
        maxRetries: automation.schedule.retries,
      });
    }

    const systemPayload = this.buildSystemPayload(automation, action, taskPayload);
    if (!systemPayload) {
      return null;
    }

    return taskRuntime.createTask({
      ownerId: automation.ownerId,
      userId: automation.ownerId,
      source: `AUTOMATION:${automation.id}`,
      correlationId: `${automation.id}:${action.id}:${Date.now()}`,
      request: {
        type: CommandType.SYSTEM,
        deviceId: `automation:${automation.id}`,
        action: systemPayload.systemAction,
        payload: systemPayload,
      },
        executeAfterMs: accumulatedDelayMs + (action.delayMs || 0),
        cooldownUntil: automation.schedule.cooldownMs ? Date.now() + automation.schedule.cooldownMs : undefined,
        maxRetries: automation.schedule.retries,
      });
  }

  private buildSystemPayload(automation: AutomationRecord, action: AutomationAction, payloadBase: Record<string, unknown>) {
    if (action.kind === 'WAIT_ACTION') {
      return {
        ...payloadBase,
        systemAction: 'automation_wait_noop',
        durationMs: action.durationMs,
      };
    }

    if (action.kind === 'VOICE_ACTION') {
      return {
        ...payloadBase,
        systemAction: 'speech_say',
        text: action.speechText,
        requireConfirmation: action.requireConfirmation || automation.schedule.requireConfirmation,
      };
    }

    if (action.kind === 'SYSTEM_ACTION') {
      return {
        ...payloadBase,
        systemAction: action.action,
      };
    }

    if (action.kind === 'TASK_ACTION') {
      return {
        ...payloadBase,
        systemAction: 'automation_run',
        targetAutomationId: action.targetAutomationId,
      };
    }

    if (action.kind === 'LOCAL_COMMAND') {
      const mapping = {
        open_app: 'local_open_app',
        open_url: 'local_open_url',
        execute_local_command: 'local_execute_command',
        performance_mode: 'local_set_performance_mode',
        focus_mode: 'local_set_focus_mode',
      } as const;

      return {
        ...payloadBase,
        systemAction: mapping[action.command],
        appTarget: action.appTarget,
        url: action.url,
        commandText: action.commandText,
      };
    }

    if (action.kind === 'EXECUTABLE_PATH_ACTION') {
      return {
        ...payloadBase,
        systemAction: 'local_execute_executable_path',
        executablePath: action.executablePath,
        executableCategory: action.category,
        executableIcon: action.icon,
        executableRegistryId: action.registryId,
        executableProvider: action.provider,
      };
    }

    if (action.kind === 'FUTURE_DEVICE_ACTION') {
      return {
        ...payloadBase,
        systemAction: 'future_device_action_placeholder',
        futureDeviceAction: action.action,
        targetId: action.targetId,
        value: action.value,
      };
    }

    logger.warn('AUTOMATION_ACTION', `unsupported_action_kind automationId=${automation.id}`);
    return null;
  }

  private syncFromTasks(tasks: PersistentTask[]): void {
    for (const automation of this.automations.values()) {
      const relatedTasks = tasks.filter((task) => task.request.payload?.automationId === automation.id);
      const activeTasks = relatedTasks.filter((task) => ['pending', 'queued', 'running', 'waiting', 'paused'].includes(task.status));
      automation.activeTaskIds = activeTasks.map((task) => task.taskId);

      if (!relatedTasks.length) {
        if (!automation.enabled) {
          automation.state = 'paused';
        } else if (automation.trigger.type === 'TIME_BASED') {
          automation.state = automation.nextExecutionAt ? 'scheduled' : 'idle';
        } else {
          automation.state = 'idle';
        }
        automation.continuity.ownershipLock = null;
        continue;
      }

      const latestTask = relatedTasks.slice().sort((left, right) => right.timestamps.updatedAt - left.timestamps.updatedAt)[0];
      const completedTasks = relatedTasks.filter((task) => task.status === 'completed');
      const failedTasks = relatedTasks.filter((task) => task.status === 'failed');
      const completedDurations = completedTasks.map(resolveTaskDurationMs).filter((value): value is number => value !== null);
      automation.continuity.metrics.retryCount = relatedTasks.reduce((sum, task) => sum + task.metrics.retryCount, 0);
      automation.continuity.metrics.orphanRecoveries = relatedTasks.reduce((sum, task) => sum + task.continuity.orphanRecoveryCount, 0);
      automation.continuity.metrics.successfulExecutions = completedTasks.length;
      automation.continuity.metrics.failedExecutions = failedTasks.length;
      automation.continuity.metrics.averageExecutionTimeMs = completedDurations.length ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length) : 0;
      automation.continuity.metrics.lastExecutionDurationMs = resolveTaskDurationMs(latestTask);
      if (activeTasks.some((task) => task.status === 'running')) {
        automation.state = 'running';
      } else if (activeTasks.some((task) => task.status === 'paused')) {
        automation.state = 'paused';
      } else if (activeTasks.some((task) => ['waiting', 'pending', 'queued'].includes(task.status))) {
        automation.state = automation.nextExecutionAt ? 'scheduled' : 'waiting';
      } else if (latestTask.status === 'failed') {
        automation.state = 'failed';
        automation.lastFailedAt = latestTask.timestamps.failedAt;
        automation.lastError = latestTask.lastError;
      } else if (latestTask.status === 'cancelled') {
        automation.state = 'cancelled';
        automation.lastCancelledAt = latestTask.timestamps.cancelledAt;
      } else if (latestTask.status === 'completed') {
        automation.state = 'completed';
        automation.lastCompletedAt = latestTask.timestamps.completedAt;
        automation.lastError = null;
      }

      if (!activeTasks.length) {
        automation.continuity.ownershipLock = null;
      }

      logger.info(
        'EXECUTION_METRICS',
        `automationId=${automation.id} success=${automation.continuity.metrics.successfulExecutions} failed=${automation.continuity.metrics.failedExecutions} retries=${automation.continuity.metrics.retryCount} avg_ms=${automation.continuity.metrics.averageExecutionTimeMs} orphan_recoveries=${automation.continuity.metrics.orphanRecoveries}`,
      );
    }

    this.reconcileAutomations('task_sync');
    this.persistSnapshot('task_sync');
    this.notifyUi('task_sync');
  }

  private reconcileAutomations(reason: string): void {
    const now = Date.now();
    for (const automation of this.automations.values()) {
      if (!automation.enabled) {
        automation.state = 'paused';
        automation.nextExecutionAt = null;
        continue;
      }

      if (automation.trigger.type === 'TIME_BASED') {
        automation.nextExecutionAt = this.resolveNextExecutionAt(automation, now);
        if (!automation.activeTaskIds.length && automation.nextExecutionAt) {
          this.ensureScheduledTasks(automation, automation.nextExecutionAt);
        }
      } else {
        automation.nextExecutionAt = null;
        if (!automation.activeTaskIds.length && automation.state === 'scheduled') {
          automation.state = 'idle';
        }
      }
      automation.updatedAt = now;
    }

    logger.info('AUTOMATION_SCHEDULER', `reconciled reason=${reason} automations=${this.automations.size}`);
  }

  private ensureScheduledTasks(automation: AutomationRecord, executeAt: number): void {
    const hasOpenTask = automation.activeTaskIds.some((taskId) => {
      const task = this.lastTaskSnapshot.find((entry) => entry.taskId === taskId);
      return task !== undefined && ['pending', 'queued', 'running', 'waiting'].includes(task.status);
    });
    if (hasOpenTask) {
      return;
    }

    let accumulatedDelayMs = 0;
    automation.activeTaskIds = automation.actions
      .map((action) => {
        if (action.kind === 'WAIT_ACTION') {
          accumulatedDelayMs += action.durationMs;
          return null;
        }

        const scheduledTask = action.kind === 'TRIGGERCMD_ACTION'
          ? taskRuntime.createTask({
              ownerId: automation.ownerId,
              userId: automation.ownerId,
              source: `AUTOMATION:${automation.id}`,
              correlationId: `${automation.id}:${action.id}:${executeAt}`,
              request: {
                type: CommandType.TRIGGER_CMD,
                deviceId: action.deviceId,
                action: action.action,
                payload: {
                  automationId: automation.id,
                  automationName: automation.name,
                  triggerUserId: automation.ownerId,
                  actionId: action.id,
                },
              },
              executeAt: executeAt + accumulatedDelayMs + (action.delayMs || 0),
              cooldownUntil: automation.schedule.cooldownMs ? executeAt + automation.schedule.cooldownMs : undefined,
              maxRetries: automation.schedule.retries,
            })
          : taskRuntime.createTask({
              ownerId: automation.ownerId,
              userId: automation.ownerId,
              source: `AUTOMATION:${automation.id}`,
              correlationId: `${automation.id}:${action.id}:${executeAt}`,
              request: {
                type: CommandType.SYSTEM,
                deviceId: `automation:${automation.id}`,
                action: this.buildSystemPayload(automation, action, {
                  automationId: automation.id,
                  automationName: automation.name,
                  actionId: action.id,
                })?.systemAction || 'future_device_action_placeholder',
                payload: this.buildSystemPayload(automation, action, {
                  automationId: automation.id,
                  automationName: automation.name,
                  actionId: action.id,
                }) || {},
              },
              executeAt: executeAt + accumulatedDelayMs + (action.delayMs || 0),
              cooldownUntil: automation.schedule.cooldownMs ? executeAt + automation.schedule.cooldownMs : undefined,
              maxRetries: automation.schedule.retries,
            });

        if ('delayMs' in action && action.delayMs) {
          accumulatedDelayMs += action.delayMs;
        }

        return scheduledTask.taskId;
      })
      .filter((taskId): taskId is string => typeof taskId === 'string');

    automation.historyTaskIds = [...new Set([...automation.historyTaskIds, ...automation.activeTaskIds])].slice(-50);
    automation.state = 'scheduled';
  }

  private evaluateConditions(automation: AutomationRecord): boolean {
    const { conditions, schedule, continuity } = automation;
    const now = new Date();
    const activeUser = useAuthStore.getState().user;
    const socketConnected = socketRuntime.getHealthMetrics().connected;
    const focusModeActive = getScopedStorageValue('orion.local.mode.focus', this.currentOwnerId) === 'active';
    const currentLifecycle = document.visibilityState === 'visible' ? 'active' : 'background';

    if (schedule.activeWindowStart && schedule.activeWindowEnd) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (currentMinutes < toMinutes(schedule.activeWindowStart) || currentMinutes > toMinutes(schedule.activeWindowEnd)) {
        return false;
      }
    }

    if (schedule.weeklyExecutionLimit) {
      const startOfWeek = new Date(now);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
      const executionsThisWeek = continuity.executionHistory.filter((timestamp) => timestamp >= startOfWeek.getTime()).length;
      if (executionsThisWeek >= schedule.weeklyExecutionLimit) {
        return false;
      }
    }

    return conditions.every((condition) => {
      if (condition.type === 'time_window') {
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = toMinutes(condition.startTime);
        const endMinutes = toMinutes(condition.endTime);
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
      if (condition.type === 'day') {
        return condition.days.includes(dayIndexToKey(now.getDay()));
      }
      if (condition.type === 'lifecycle') {
        return currentLifecycle === condition.lifecycle;
      }
      if (condition.type === 'socket_connected') {
        return socketConnected === condition.expected;
      }
      if (condition.type === 'user_active') {
        return Boolean(activeUser) === condition.expected;
      }
      if (condition.type === 'focus_mode_active') {
        return focusModeActive === condition.expected;
      }
      return true;
    });
  }

  private resolveNextExecutionAt(automation: AutomationRecord, nowMs: number): number | null {
    if (automation.trigger.type !== 'TIME_BASED') {
      return null;
    }

    const now = new Date(nowMs);
    const trigger = automation.trigger;
    if (trigger.scheduleMode === 'one_shot') {
      if (automation.lastExecutionAt) {
        return null;
      }
      if (trigger.oneShotAt) {
        return trigger.oneShotAt > nowMs ? trigger.oneShotAt : null;
      }
      return this.resolveNextFixedTime(trigger.time, now, trigger.activeDays, trigger.recurrence);
    }

    if (trigger.scheduleMode === 'interval') {
      const base = automation.lastExecutionAt || nowMs;
      const intervalMinutes = Math.max(1, trigger.intervalMinutes || 30);
      return base + intervalMinutes * 60 * 1000 + (trigger.delayMs || 0);
    }

    return this.resolveNextFixedTime(trigger.time, now, trigger.activeDays, trigger.recurrence, trigger.delayMs || 0);
  }

  private resolveNextFixedTime(time: string, now: Date, days: AutomationDay[], recurrence: AutomationTrigger extends never ? never : any, extraDelayMs = 0): number | null {
    const [hours, minutes] = time.split(':').map(Number);
    const next = new Date(now);

    for (let offset = 0; offset < 8; offset += 1) {
      const candidate = new Date(next);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(hours || 0, minutes || 0, 0, 0);
      if (candidate.getTime() <= now.getTime() && offset === 0) {
        continue;
      }
      const dayKey = dayIndexToKey(candidate.getDay());
      if (isDayAllowed(dayKey, days, recurrence)) {
        return candidate.getTime() + extraDelayMs;
      }
    }

    return null;
  }

  private seedDefaultsForCurrentUser(): void {
    const ownerId = useAuthStore.getState().user?.uid;
    if (!ownerId) {
      return;
    }

    logger.info('AUTOMATION_SEED_GUARD', `authenticated_seed_blocked ownerId=${ownerId} reason=preview_only_examples`);
    this.markOwnerInitialized(ownerId);
  }

  private restoreSnapshot(): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('automation_restore_snapshot')) {
      logger.info('USER_RUNTIME', 'automation_preview_mode restore_skipped=true');
      useAutomationStore.getState().setHydrated(true);
      useAutomationStore.getState().setLoading(false);
      return;
    }

    const snapshot = this.readSnapshot(STORAGE_KEY) || this.readSnapshot(STORAGE_BACKUP_KEY);
    if (!snapshot) {
      logger.info('AUTOMATION_RESTORE', 'snapshot_missing=true');
      if (this.currentOwnerId) {
        this.markOwnerInitialized(this.currentOwnerId);
        logger.info('AUTOMATION_SEED_GUARD', `authenticated_seed_blocked ownerId=${this.currentOwnerId} reason=no_snapshot`);
      }
      useAutomationStore.getState().setHydrated(true);
      useAutomationStore.getState().setLoading(false);
      return;
    }

    this.restoredSnapshotPresent = true;
    logger.info('AUTOMATION_RESTORE', `snapshot_found=true updatedAt=${snapshot.updatedAt} automations=${snapshot.automations.length}`);
    logger.info('AUTOMATION_AUTH_SCOPE', `restore_scope owner=${snapshot.ownerId} session=${snapshot.runtimeSessionId} runtime=${snapshot.runtimeId}`);

    if (!runtimeIdentity.recoveryOwnershipGuard('automation_restore_snapshot', {
      ownerId: snapshot.ownerId,
      runtimeSessionId: snapshot.runtimeSessionId,
      runtimeDeviceId: snapshot.runtimeDeviceId,
      allowCrossSessionRestore: true,
    })) {
      runtimeIdentity.orphanSnapshotCleanup('automation_restore_snapshot_rejected', [STORAGE_KEY, STORAGE_BACKUP_KEY], this.currentOwnerId);
      useAutomationStore.getState().setHydrated(true);
      useAutomationStore.getState().setLoading(false);
      return;
    }

    for (const candidate of snapshot.automations) {
      const normalized = this.safeNormalizeRestoredAutomation(candidate);
      if (normalized && normalized.ownerId === this.currentOwnerId) {
        this.automations.set(normalized.id, normalized);
        this.markOwnerInitialized(normalized.ownerId);
      }
    }
    logger.info('AUTOMATION_HYDRATION', `snapshot_restored automations=${this.automations.size}`);
    if (this.currentOwnerId) {
      this.markOwnerInitialized(this.currentOwnerId);
    }
    useAutomationStore.getState().setHydrated(true);
    useAutomationStore.getState().setLoading(false);
  }

  private restoreDraft(): void {
    if (!this.currentOwnerId) {
      return;
    }

    try {
      const raw = getScopedStorageValue(DRAFT_STORAGE_KEY, this.currentOwnerId);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as AutomationDraft;
      if (!parsed?.data?.ownerId || parsed.data.ownerId !== this.currentOwnerId) {
        throw new Error('INVALID_DRAFT_SHAPE');
      }
      useAutomationStore.getState().setDraft({
        ...parsed,
        data: this.normalizeMutableData(parsed.data, true),
      });
      useAutomationStore.getState().setEditorOpen(true);
      logger.info('AUTOMATION_EDITOR', `draft_restored mode=${parsed.mode}`);
    } catch (error: any) {
      removeScopedStorageValue(DRAFT_STORAGE_KEY, this.currentOwnerId);
      logger.warn('AUTOMATION_RECOVERY', `draft_restore_failed error=${error?.message || error}`);
    }
  }

  private readSnapshot(key: string): AutomationSnapshot | null {
    try {
      const scopedKey = getScopedStorageKey(key, this.currentOwnerId);
      if (!scopedKey) {
        return null;
      }
      const raw = window.localStorage.getItem(scopedKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { checksum?: string; data?: AutomationSnapshot };
      if (!parsed.data || parsed.data.version !== SNAPSHOT_VERSION || !parsed.checksum || !parsed.data.runtimeSessionId) {
        logger.warn('AUTOMATION_RESTORE', `snapshot_rejected key=${scopedKey} reason=invalid_shape`);
        return null;
      }
      if (!runtimeIdentity.hydrationOwnerValidation('automation_read_snapshot', {
        ownerId: parsed.data.ownerId,
        runtimeSessionId: parsed.data.runtimeSessionId,
        runtimeDeviceId: parsed.data.runtimeDeviceId,
        allowCrossSessionRestore: true,
      })) {
        logger.warn('SESSION_ISOLATION', `automation_snapshot_scope_rejected key=${scopedKey} owner=${parsed.data.ownerId} active=${this.currentOwnerId || 'preview'}`);
        return null;
      }
      if (this.computeChecksum(parsed.data) !== parsed.checksum) {
        logger.warn('AUTOMATION_INTEGRITY', `snapshot_checksum_mismatch key=${scopedKey}`);
        logger.warn('AUTOMATION_RESTORE', `snapshot_rejected key=${scopedKey} reason=checksum_mismatch`);
        return null;
      }
      this.checksum = parsed.checksum;
      logger.info('AUTOMATION_SNAPSHOT', `snapshot_loaded key=${key} checksum=${parsed.checksum}`);
      return parsed.data;
    } catch (error: any) {
      logger.warn('AUTOMATION_HYDRATION', `snapshot_restore_failed key=${key} error=${error?.message || error}`);
      return null;
    }
  }

  private persistSnapshot(reason: string): void {
    if (!runtimeIdentity.requiresPersistentExecution(`automation_persist_${reason}`) || !this.currentOwnerId) {
      logger.info('STORAGE_SCOPE', `automation_snapshot_persist_skipped reason=${reason} owner=preview`);
      return;
    }

    const snapshot: AutomationSnapshot = {
      version: SNAPSHOT_VERSION,
      runtimeId: this.runtimeId,
      ownerId: this.currentOwnerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      updatedAt: Date.now(),
      automations: Array.from(this.automations.values()),
    };

    const checksum = this.computeChecksum(snapshot);
    if (checksum === this.checksum) {
      logger.info('AUTOMATION_SNAPSHOT', `snapshot_skip reason=checksum_match trigger=${reason}`);
      return;
    }

    const payload = JSON.stringify({ checksum, data: snapshot });
    const backupKey = getScopedStorageKey(STORAGE_BACKUP_KEY, this.currentOwnerId);
    const primaryKey = getScopedStorageKey(STORAGE_KEY, this.currentOwnerId);
    if (!backupKey || !primaryKey) {
      return;
    }
    window.localStorage.setItem(backupKey, payload);
    window.localStorage.setItem(primaryKey, payload);
    this.checksum = checksum;
    this.restoredSnapshotPresent = true;
    logger.info('AUTOMATION_RUNTIME', `snapshot_committed reason=${reason} automations=${snapshot.automations.length}`);
    logger.info('AUTOMATION_SNAPSHOT', `snapshot_committed reason=${reason} checksum=${checksum} automations=${snapshot.automations.length}`);
  }

  private persistDraft(draft: AutomationDraft, debounce = false): void {
    if (this.draftPersistTimer) {
      window.clearTimeout(this.draftPersistTimer);
      this.draftPersistTimer = null;
    }

    const commit = () => {
      if (!this.currentOwnerId || !runtimeIdentity.requiresPersistentExecution('automation_persist_draft')) {
        return;
      }
      const scopedKey = getScopedStorageKey(DRAFT_STORAGE_KEY, this.currentOwnerId);
      if (!scopedKey) {
        return;
      }
      window.localStorage.setItem(scopedKey, JSON.stringify(draft));
      this.draftPersistTimer = null;
    };

    if (debounce) {
      this.draftPersistTimer = window.setTimeout(commit, 180);
      return;
    }

    commit();
  }

  private notifyUi(reason: string): void {
    useAutomationStore.getState().setAutomations(Array.from(this.automations.values()).map((automation) => this.cloneAutomation(automation)!).sort((left, right) => left.name.localeCompare(right.name)));
    useAutomationStore.getState().setHydrated(true);
    useAutomationStore.getState().setLoading(false);
    logger.info('AUTOMATION_UI', `state_updated reason=${reason} automations=${this.automations.size}`);
  }

  private commitNewAutomation(input: Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'>): AutomationRecord | null {
    const now = Date.now();
    const next = this.normalizeAutomationRecord({
      ...input,
      id: `automation_${Math.random().toString(36).slice(2)}_${now}`,
      createdAt: now,
      updatedAt: now,
      state: input.enabled ? 'idle' : 'paused',
      nextExecutionAt: null,
      lastExecutionAt: null,
      lastCompletedAt: null,
      lastFailedAt: null,
      lastCancelledAt: null,
      lastError: null,
      activeTaskIds: [],
      historyTaskIds: [],
      continuity: {
        dedupeKey: `${input.ownerId}:${input.name.toLowerCase()}:${input.type}`,
        ownershipLock: null,
        restoreCount: 0,
        recoveryCount: 0,
        lastHydratedAt: now,
        lastEventKey: null,
        corruptedRecovered: false,
        executionHistory: [],
        metrics: createDefaultAutomationMetrics(),
      },
    });

    this.automations.set(next.id, next);
    return this.cloneAutomation(next);
  }

  private commitAutomationUpdate(automationId: string, data: Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'>): AutomationRecord | null {
    const existing = this.automations.get(automationId);
    if (!existing) {
      return null;
    }

    const next = this.normalizeAutomationRecord({
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
      activeTaskIds: existing.activeTaskIds,
      historyTaskIds: existing.historyTaskIds,
      continuity: {
        ...existing.continuity,
        dedupeKey: `${data.ownerId}:${data.name.toLowerCase()}:${data.type}`,
      },
    });

    this.automations.set(existing.id, next);
    return this.cloneAutomation(next);
  }

  private extractMutableDraftData(record: AutomationRecord): Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'> {
    return {
      ownerId: record.ownerId,
      name: record.name,
      description: record.description,
      type: record.type,
      enabled: record.enabled,
      trigger: record.trigger,
      conditions: record.conditions,
      actions: record.actions,
      schedule: record.schedule,
    };
  }

  private normalizeMutableData(data: Omit<AutomationRecord, 'id' | 'createdAt' | 'updatedAt' | 'state' | 'nextExecutionAt' | 'lastExecutionAt' | 'lastCompletedAt' | 'lastFailedAt' | 'lastCancelledAt' | 'lastError' | 'activeTaskIds' | 'historyTaskIds' | 'continuity'>, preserveText = false) {
    return {
      ...data,
      name: preserveText ? data.name : data.name.trim(),
      description: preserveText ? data.description : data.description.trim(),
      trigger: data.trigger.type === 'TIME_BASED'
        ? {
            ...data.trigger,
            intervalMinutes: data.trigger.intervalMinutes ? Math.max(1, data.trigger.intervalMinutes) : null,
            delayMs: data.trigger.delayMs ? Math.max(0, data.trigger.delayMs) : 0,
            oneShotAt: data.trigger.oneShotAt ?? null,
          }
        : { ...data.trigger },
      conditions: data.conditions.map((condition) => ({ ...condition })),
      actions: data.actions.map((action) => action.kind === 'WAIT_ACTION'
        ? { ...action, durationMs: Math.max(0, action.durationMs) }
        : ({ ...action })),
      schedule: {
        retries: Math.max(0, data.schedule.retries),
        cooldownMs: Math.max(0, data.schedule.cooldownMs),
        priority: Math.max(1, data.schedule.priority),
        requireConfirmation: Boolean(data.schedule.requireConfirmation),
        repeatEnabled: Boolean(data.schedule.repeatEnabled),
        activeWindowStart: data.schedule.activeWindowStart || null,
        activeWindowEnd: data.schedule.activeWindowEnd || null,
        weeklyExecutionLimit: data.schedule.weeklyExecutionLimit ? Math.max(1, data.schedule.weeklyExecutionLimit) : null,
      },
    };
  }

  private normalizeAutomationRecord(record: AutomationRecord): AutomationRecord {
    return {
      ...record,
      name: record.name.trim(),
      description: record.description.trim(),
      conditions: record.conditions.map((condition) => ({ ...condition })),
      actions: record.actions.map((action) => action.kind === 'WAIT_ACTION'
        ? { ...action, durationMs: Math.max(0, action.durationMs) }
        : ({ ...action })),
      activeTaskIds: [...record.activeTaskIds],
      historyTaskIds: [...record.historyTaskIds],
      continuity: {
        ...record.continuity,
        executionHistory: Array.isArray(record.continuity?.executionHistory) ? record.continuity.executionHistory.slice(-100) : [],
        metrics: {
          ...createDefaultAutomationMetrics(),
          ...record.continuity?.metrics,
        },
      },
      trigger: record.trigger.type === 'TIME_BASED'
        ? {
            ...record.trigger,
            intervalMinutes: record.trigger.intervalMinutes ? Math.max(1, record.trigger.intervalMinutes) : null,
            delayMs: record.trigger.delayMs ? Math.max(0, record.trigger.delayMs) : 0,
            oneShotAt: record.trigger.oneShotAt ?? null,
          }
        : { ...record.trigger },
      schedule: {
        retries: Math.max(0, record.schedule.retries),
        cooldownMs: Math.max(0, record.schedule.cooldownMs),
        priority: Math.max(1, record.schedule.priority),
        requireConfirmation: Boolean(record.schedule.requireConfirmation),
        repeatEnabled: Boolean(record.schedule.repeatEnabled),
        activeWindowStart: record.schedule.activeWindowStart || null,
        activeWindowEnd: record.schedule.activeWindowEnd || null,
        weeklyExecutionLimit: record.schedule.weeklyExecutionLimit ? Math.max(1, record.schedule.weeklyExecutionLimit) : null,
      },
    };
  }

  private safeNormalizeRestoredAutomation(candidate: unknown): AutomationRecord | null {
    try {
      const automation = candidate as AutomationRecord;
      if (!automation?.id || !automation.ownerId || !automation.name || !automation.trigger || !Array.isArray(automation.actions)) {
        throw new Error('INVALID_AUTOMATION_RECORD');
      }

      return this.normalizeAutomationRecord({
        ...automation,
        continuity: {
          ...automation.continuity,
          ownershipLock: null,
          restoreCount: (automation.continuity?.restoreCount || 0) + 1,
          lastHydratedAt: Date.now(),
          corruptedRecovered: Boolean(automation.continuity?.corruptedRecovered),
          executionHistory: Array.isArray(automation.continuity?.executionHistory) ? automation.continuity.executionHistory.slice(-100) : [],
          metrics: {
            ...createDefaultAutomationMetrics(),
            ...automation.continuity?.metrics,
          },
        },
      });
    } catch (error: any) {
      logger.warn('AUTOMATION_RECOVERY', `corrupted_automation_recovered error=${error?.message || error}`);
      return null;
    }
  }

  private cloneAutomation(record: AutomationRecord | null): AutomationRecord | null {
    return record ? JSON.parse(JSON.stringify(record)) as AutomationRecord : null;
  }

  private mapContextToSystemTrigger(detail: RuntimeContextDetail): AutomationSystemTrigger | null {
    if (detail.action === 'socket_disconnected') return 'socket_disconnected';
    if (detail.action === 'startup') return 'startup';
    if (detail.action === 'recovery') return 'recovery';
    if (detail.action === 'app_opened') return 'app_opened';
    if (detail.action === 'socket_connected') return 'reconnect';
    return null;
  }

  private computeChecksum(snapshot: AutomationSnapshot): string {
    const input = JSON.stringify(snapshot);
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  private validateActions(actions: AutomationAction[]): boolean {
    return actions.every((action) => {
      if (action.kind === 'VOICE_ACTION') {
        return Boolean(action.speechText.trim());
      }
      if (action.kind === 'TASK_ACTION') {
        return Boolean(action.targetAutomationId.trim());
      }
      if (action.kind === 'TRIGGERCMD_ACTION') {
        return Boolean(action.deviceId.trim() && action.action.trim());
      }
      if (action.kind === 'EXECUTABLE_PATH_ACTION') {
        return isExecutablePathValid(action.executablePath.trim());
      }
      if (action.kind === 'WAIT_ACTION') {
        return action.durationMs >= 0;
      }
      if (action.kind === 'LOCAL_COMMAND' && action.command === 'open_url') {
        return Boolean((action.url || '').trim());
      }
      return true;
    });
  }

  private restoreSeedState(): Set<string> {
    try {
      const raw = getScopedStorageValue(SEED_STATE_STORAGE_KEY, this.currentOwnerId);
      if (!raw) {
        return new Set<string>();
      }
      const parsed = JSON.parse(raw) as string[];
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch {
      return new Set<string>();
    }
  }

  private markOwnerInitialized(ownerId: string): void {
    if (!ownerId || this.seedState.has(ownerId)) {
      return;
    }
    this.seedState.add(ownerId);
    if (this.currentOwnerId) {
      const scopedKey = getScopedStorageKey(SEED_STATE_STORAGE_KEY, this.currentOwnerId);
      if (scopedKey) {
        window.localStorage.setItem(scopedKey, JSON.stringify(Array.from(this.seedState.values())));
      }
    }
    logger.info('AUTOMATION_OWNERSHIP', `owner_initialized ownerId=${ownerId}`);
    logger.info('AUTOMATION_SEED_GUARD', `persistent_owner_init_flag=true ownerId=${ownerId}`);
  }
}

function dayIndexToKey(dayIndex: number): AutomationDay {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex] as AutomationDay;
}

function isDayAllowed(day: AutomationDay, days: AutomationDay[], recurrence: 'daily' | 'weekdays' | 'weekend' | 'custom' | 'once'): boolean {
  if (recurrence === 'daily' || recurrence === 'once') {
    return true;
  }
  if (recurrence === 'weekdays') {
    return ['mon', 'tue', 'wed', 'thu', 'fri'].includes(day);
  }
  if (recurrence === 'weekend') {
    return ['sat', 'sun'].includes(day);
  }
  return days.length > 0 ? days.includes(day) : true;
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function resolveTaskDurationMs(task: PersistentTask): number | null {
  if (!task.timestamps.startedAt) {
    return null;
  }
  const end = task.timestamps.completedAt || task.timestamps.failedAt || task.timestamps.cancelledAt;
  if (!end) {
    return null;
  }
  return Math.max(0, end - task.timestamps.startedAt);
}

function createDefaultAutomationMetrics() {
  return {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    retryCount: 0,
    averageExecutionTimeMs: 0,
    lastExecutionDurationMs: null,
    orphanRecoveries: 0,
    skippedExecutions: 0,
    cooldownBlocks: 0,
  };
}

export const automationStoreService = AutomationStoreService.getInstance();
