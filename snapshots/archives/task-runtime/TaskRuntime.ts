import { logger } from '@core/logger/Logger';
import { commandQueue } from '@core/command-runtime/execution/CommandExecutionQueue';
import { CommandStatus } from '@core/command-runtime/types';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageKey } from '@core/runtime/ScopedBrowserStorage';
import { useAuthStore } from '@core/state/stores/useAuthStore';
import {
  buildTaskCommandRequest,
  CreateTaskInput,
  PersistentTask,
  TaskMetricsSnapshot,
  TaskRuntimeSnapshot,
  TaskStatus,
} from './types';

const STORAGE_KEY = 'orion.task.runtime.snapshot.v1';
const STORAGE_BACKUP_KEY = 'orion.task.runtime.snapshot.backup.v1';
const SNAPSHOT_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const ORPHAN_THRESHOLD_MS = 60_000;
const COMPLETED_STALE_MS = 24 * 60 * 60 * 1000;
const FAILURE_BACKOFF_MS = 15_000;

type RuntimeContextEvent = {
  type: string;
  action: string;
  payload?: Record<string, unknown>;
};

class TaskRuntime {
  private static instance: TaskRuntime;

  private initialized = false;
  private runtimeId = `task_rt_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  private tasks = new Map<string, PersistentTask>();
  private persistChecksum = '';
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private flushPromise: Promise<void> | null = null;
  private unsubscribeQueue: (() => void) | null = null;
  private lastMetricsKey = '';
  private currentLifecycle = 'BOOTING';
  private listeners: Array<(tasks: PersistentTask[]) => void> = [];
  private currentOwnerId: string | null = null;
  private currentRuntimeSessionId = '';
  private authSubscriptionAttached = false;

  private constructor() {}

  public static getInstance(): TaskRuntime {
    if (!TaskRuntime.instance) {
      TaskRuntime.instance = new TaskRuntime();
    }

    return TaskRuntime.instance;
  }

  public init(): void {
    if (this.initialized) {
      logger.warn('TASK_INTEGRITY', `task_runtime_init_blocked duplicate=true runtime=${this.runtimeId}`);
      return;
    }

    this.initialized = true;
    this.currentOwnerId = runtimeIdentity.getOwnerId();
    this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
    this.restoreSnapshot();
    this.attachQueueObserver();
    this.attachContextObservers();
    this.attachAuthObserver();
    this.startWatchdog();
    this.schedulePass('init');
    this.logMetrics('init');
    logger.info('TASK_RUNTIME', `initialized runtime=${this.runtimeId} restored_tasks=${this.tasks.size}`);
  }

  public subscribe(listener: (tasks: PersistentTask[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getTasks());
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    };
  }

  public getTasks(): PersistentTask[] {
    return Array.from(this.tasks.values()).map((task) => ({
      ...task,
      request: { ...task.request },
      trigger: task.trigger ? { ...task.trigger } : null,
      timestamps: { ...task.timestamps },
      schedule: { ...task.schedule },
      metrics: { ...task.metrics },
      continuity: { ...task.continuity },
      restoreGuard: { ...task.restoreGuard },
    }));
  }

  public getTask(taskId: string): PersistentTask | null {
    return this.getTasks().find((task) => task.taskId === taskId) || null;
  }

  public createTask(input: CreateTaskInput): PersistentTask {
    if (!runtimeIdentity.requiresPersistentExecution('task_create') || !runtimeIdentity.requiresExecutionPermission('task_create', input.ownerId)) {
      throw new Error('PREVIEW_MODE_EXECUTION_BLOCKED');
    }

    const now = Date.now();
    const taskId = `task_${Math.random().toString(36).slice(2)}_${now}`;
    const correlationId = input.correlationId || `corr_${taskId}`;
    const executeAt = input.executeAt ?? (input.executeAfterMs ? now + input.executeAfterMs : null);
    const delayed = Boolean(executeAt || input.retryAfter || input.cooldownUntil);
    const dedupeKey = this.buildDedupeKey(input.ownerId, input.request.deviceId, input.request.action, executeAt, input.trigger?.type);

    const duplicate = this.findOpenDuplicate(dedupeKey);
    if (duplicate) {
      logger.warn('TASK_GUARD', `task_deduplicated taskId=${duplicate.taskId} correlationId=${duplicate.correlationId}`);
      return duplicate;
    }

    const status = delayed || input.trigger ? 'waiting' : 'pending';
    const task: PersistentTask = {
      taskId,
      correlationId,
      ownerId: input.ownerId,
      userId: input.userId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      source: input.source,
      status,
      request: input.request,
      trigger: input.trigger
        ? {
            ...input.trigger,
            lastSatisfiedAt: null,
          }
        : null,
      timestamps: {
        createdAt: now,
        updatedAt: now,
        queuedAt: null,
        startedAt: null,
        waitingAt: status === 'waiting' ? now : null,
        pausedAt: null,
        completedAt: null,
        failedAt: null,
        cancelledAt: null,
        expiredAt: null,
      },
      schedule: {
        executeAt,
        retryAfter: input.retryAfter ?? null,
        cooldownUntil: input.cooldownUntil ?? null,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        expiresAt: input.expiresAt ?? null,
        maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
      },
      metrics: {
        retryCount: 0,
      },
      persistenceState: 'memory',
      continuity: {
        dedupeKey,
        executionOwnerLock: null,
        lastExecutionKey: null,
        lastQueueAt: null,
        lastRunAt: null,
        lastCompletionAt: null,
        lastLifecycleEvent: this.currentLifecycle,
        lastLifecycleAt: now,
        lastContextEvent: null,
        lastContextEventAt: null,
        restoreCount: 0,
        recoveryCount: 0,
        orphanRecoveryCount: 0,
        delayed,
      },
      restoreGuard: {
        restoredAt: null,
        restoredByRuntimeId: null,
        lastPersistedChecksum: null,
      },
      lastError: null,
    };

    this.tasks.set(task.taskId, task);
    this.persistSnapshot('create');
    logger.info('TASK_PERSISTENCE', `task_created taskId=${task.taskId} status=${task.status} delayed=${delayed}`);
    if (delayed) {
      logger.info('TASK_TEMPORAL', `task_registered taskId=${task.taskId} executeAt=${task.schedule.executeAt || 'none'} retryAfter=${task.schedule.retryAfter || 'none'} cooldownUntil=${task.schedule.cooldownUntil || 'none'} source=${task.source}`);
    }
    this.schedulePass('create_task');
    this.emit();
    return task;
  }

  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'expired') {
      return false;
    }
    if (task.status === 'running') {
      logger.warn('TASK_GUARD', `cancel_blocked_running taskId=${taskId}`);
      return false;
    }
    this.updateTask(task, 'cancelled', {
      cancelledAt: Date.now(),
      executionOwnerLock: null,
      lastError: null,
    });
    this.persistSnapshot('cancel');
    this.emit();
    return true;
  }

  public pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'running' || task.status === 'completed' || task.status === 'cancelled') {
      return false;
    }
    this.updateTask(task, 'paused', {
      pausedAt: Date.now(),
    });
    this.persistSnapshot('pause');
    this.emit();
    return true;
  }

  public resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'paused') {
      return false;
    }
    const nextStatus = this.isTaskReady(task) ? 'pending' : 'waiting';
    this.updateTask(task, nextStatus, {
      pausedAt: null,
      waitingAt: nextStatus === 'waiting' ? Date.now() : task.timestamps.waitingAt,
    });
    this.persistSnapshot('resume');
    this.schedulePass('resume_task');
    this.emit();
    return true;
  }

  public async enqueueTaskExecution(taskId: string, reason: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || !this.canExecuteTask(task)) {
      return;
    }

    if (!runtimeIdentity.taskOwnershipGuard('task_enqueue_execution', task)) {
      return;
    }

    if (task.continuity.executionOwnerLock && task.continuity.executionOwnerLock !== this.runtimeId) {
      logger.warn('TASK_INTEGRITY', `ownership_blocked taskId=${task.taskId} owner_lock=${task.continuity.executionOwnerLock}`);
      return;
    }

    const executionKey = `${task.taskId}:${task.metrics.retryCount}:${task.schedule.executeAt || task.timestamps.createdAt}`;
    if (task.continuity.lastExecutionKey === executionKey && (task.status === 'queued' || task.status === 'running')) {
      logger.warn('TASK_GUARD', `duplicate_execution_prevented taskId=${task.taskId}`);
      return;
    }

    this.updateTask(task, 'queued', {
      queuedAt: Date.now(),
      executionOwnerLock: this.runtimeId,
      lastExecutionKey: executionKey,
      lastQueueAt: Date.now(),
      waitingAt: null,
    });
    this.persistSnapshot('queue');
    logger.info('TASK_EXECUTION', `task_queued taskId=${task.taskId} reason=${reason}`);
    this.emit();

    const response = await commandQueue.enqueue(buildTaskCommandRequest(task));
    if (response.status !== CommandStatus.SUCCESS && this.tasks.get(task.taskId)?.status !== 'failed') {
      this.handleTaskFailure(task.taskId, response.message || 'TASK_EXECUTION_FAILED');
    }
  }

  public notifyContextEvent(event: RuntimeContextEvent): void {
    const now = Date.now();
    const eventType = this.mapContextEvent(event);
    if (!eventType) {
      return;
    }

    for (const task of this.tasks.values()) {
      if (!task.trigger || task.trigger.type !== eventType) {
        continue;
      }

      task.trigger.lastSatisfiedAt = now;
      task.continuity.lastContextEvent = `${event.type}:${event.action}`;
      task.continuity.lastContextEventAt = now;
      if (task.status === 'paused' || task.status === 'cancelled' || task.status === 'completed' || task.status === 'failed' || task.status === 'expired') {
        continue;
      }

      if (task.trigger.requiresAuthorization && !runtimeIdentity.taskOwnershipGuard('task_context_authorization', task)) {
        logger.warn('TASK_GUARD', `context_authorization_blocked taskId=${task.taskId} trigger=${task.trigger.type}`);
        continue;
      }

      if (task.status === 'waiting' && this.isTaskReady(task)) {
        this.updateTask(task, 'pending', {});
      }
    }

    this.persistSnapshot('context_event');
    this.schedulePass(`context_${eventType}`);
    this.emit();
  }

  public runIntegrityPass(reason: string): void {
    if (!this.initialized) {
      return;
    }

    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (task.schedule.expiresAt && now >= task.schedule.expiresAt && !this.isTerminal(task.status)) {
        this.updateTask(task, 'expired', {
          expiredAt: now,
          executionOwnerLock: null,
        });
        logger.warn('TASK_GUARD', `task_expired taskId=${task.taskId} reason=${reason}`);
        continue;
      }

      if (task.status === 'running' && task.timestamps.startedAt && now - task.timestamps.startedAt > task.schedule.timeoutMs) {
        this.handleTaskFailure(task.taskId, `TASK_TIMEOUT_${reason}`);
        continue;
      }

      if ((task.status === 'queued' || task.status === 'running') && task.timestamps.updatedAt && now - task.timestamps.updatedAt > ORPHAN_THRESHOLD_MS) {
        task.continuity.recoveryCount += 1;
        task.continuity.orphanRecoveryCount += 1;
        this.updateTask(task, 'waiting', {
          executionOwnerLock: null,
          retryAfter: now + FAILURE_BACKOFF_MS,
          waitingAt: now,
        });
        logger.warn('TASK_RECOVERY', `orphan_recovered taskId=${task.taskId} reason=${reason}`);
      }
    }

    this.cleanupStaleCompletedTasks(now);
    this.persistSnapshot(`integrity_${reason}`);
    this.schedulePass(`integrity_${reason}`);
    this.logMetrics(`integrity_${reason}`);
    this.emit();
  }

  private attachQueueObserver(): void {
    this.unsubscribeQueue = commandQueue.subscribe((event) => {
      const taskId = event.request.taskContext?.taskId;
      if (!taskId) {
        return;
      }

      const task = this.tasks.get(taskId);
      if (!task) {
        return;
      }

      if (event.phase === 'executing') {
        this.updateTask(task, 'running', {
          startedAt: Date.now(),
          lastRunAt: Date.now(),
        });
        this.persistSnapshot('queue_executing');
        this.emit();
        return;
      }

      if (event.phase === 'completed' && event.response?.status === CommandStatus.SUCCESS) {
        this.updateTask(task, 'completed', {
          completedAt: Date.now(),
          executionOwnerLock: null,
          lastCompletionAt: Date.now(),
          lastError: null,
        });
        logger.info('TASK_EXECUTION', `task_completed taskId=${task.taskId}`);
        this.persistSnapshot('queue_completed');
        this.emit();
        return;
      }

      if (event.phase === 'failed' || (event.phase === 'completed' && event.response?.status !== CommandStatus.SUCCESS)) {
        this.handleTaskFailure(task.taskId, event.error || event.response?.message || 'TASK_QUEUE_FAILURE');
      }
    });
  }

  private attachContextObservers(): void {
    window.addEventListener('pageshow', () => {
      this.currentLifecycle = 'ACTIVE';
      this.notifyContextEvent({ type: 'window', action: 'app_opened' });
    });
    window.addEventListener('focus', () => {
      this.currentLifecycle = 'ACTIVE';
      this.notifyContextEvent({ type: 'window', action: 'app_opened' });
    });
    document.addEventListener('visibilitychange', () => {
      this.currentLifecycle = document.visibilityState === 'visible' ? 'ACTIVE' : 'BACKGROUND';
      this.notifyContextEvent({ type: 'lifecycle', action: this.currentLifecycle.toLowerCase() });
    });
    window.addEventListener('orion:runtime-context', ((nativeEvent: Event) => {
      const detail = (nativeEvent as CustomEvent<RuntimeContextEvent>).detail;
      if (detail) {
        if (detail.type === 'lifecycle') {
          this.currentLifecycle = String(detail.action).toUpperCase();
        }
        this.notifyContextEvent(detail);
      }
    }) as EventListener);
  }

  private attachAuthObserver(): void {
    if (this.authSubscriptionAttached) {
      return;
    }

    this.authSubscriptionAttached = true;
    let previousOwnerId = this.currentOwnerId;
    let previousAuthState = useAuthStore.getState().state;
    let pendingAuthTransition = false;
    useAuthStore.subscribe((state) => {
      const nextOwnerId = state.user?.uid || null;
      const nextAuthState = state.state;
      if (nextAuthState === 'AUTHENTICATING' || nextAuthState === 'RESTORING_SESSION') {
        pendingAuthTransition = true;
        logger.info('AUTH_TRANSITION', `task_runtime_transition_wait auth=${nextAuthState} owner=${previousOwnerId || 'preview'}`);
        previousAuthState = nextAuthState;
        return;
      }

      if (nextOwnerId === previousOwnerId && nextAuthState === previousAuthState) {
        return;
      }

      if (nextOwnerId !== previousOwnerId) {
        this.handleOwnerChange(previousOwnerId, nextOwnerId);
        previousOwnerId = nextOwnerId;
      } else if (pendingAuthTransition) {
        pendingAuthTransition = false;
        this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
        this.schedulePass('auth_resume');
        this.emit();
        logger.info('HYDRATION_RUNTIME', `task_runtime_resumed owner=${nextOwnerId || 'preview'} auth=${nextAuthState}`);
      }
      previousAuthState = nextAuthState;
    });
  }

  private handleOwnerChange(previousOwnerId: string | null, nextOwnerId: string | null): void {
    logger.info('SESSION_ISOLATION', `task_runtime_owner_change prev=${previousOwnerId || 'preview'} next=${nextOwnerId || 'preview'}`);
    this.tasks.clear();
    this.persistChecksum = '';
    this.lastMetricsKey = '';
    this.currentOwnerId = nextOwnerId;
    this.currentRuntimeSessionId = runtimeIdentity.getRuntimeSessionId();
    this.restoreSnapshot();
    this.schedulePass('owner_change');
    this.emit();
  }

  private restoreSnapshot(): void {
    if (!runtimeIdentity.requiresAuthenticatedRuntime('task_restore_snapshot')) {
      logger.info('USER_RUNTIME', 'task_runtime_preview_mode restore_skipped=true');
      return;
    }

    const restored = this.readSnapshot(STORAGE_KEY) || this.readSnapshot(STORAGE_BACKUP_KEY);
    if (!restored) {
      return;
    }

    if (!runtimeIdentity.recoveryOwnershipGuard('task_restore_snapshot', {
      ownerId: restored.ownerId,
      runtimeSessionId: restored.runtimeSessionId,
      runtimeDeviceId: restored.runtimeDeviceId,
      allowCrossSessionRestore: true,
    })) {
      runtimeIdentity.orphanSnapshotCleanup('task_restore_snapshot_rejected', [STORAGE_KEY, STORAGE_BACKUP_KEY], this.currentOwnerId);
      return;
    }

    const now = Date.now();
    for (const task of restored.tasks || []) {
      if (!runtimeIdentity.hydrationOwnerValidation('task_restore_entity', {
        ownerId: task.ownerId,
        runtimeSessionId: task.runtimeSessionId,
        runtimeDeviceId: task.runtimeDeviceId,
        allowCrossSessionRestore: true,
      })) {
        logger.warn('RUNTIME_OWNER', `task_restore_skipped taskId=${task.taskId} owner=${task.ownerId} active=${this.currentOwnerId || 'preview'}`);
        continue;
      }
      const normalized = this.normalizeRestoredTask(task, now);
      this.tasks.set(normalized.taskId, normalized);
    }

    logger.info('TASK_PERSISTENCE', `snapshot_restored tasks=${this.tasks.size}`);
    this.persistSnapshot('restore');
    this.emit();
  }

  private normalizeRestoredTask(task: PersistentTask, now: number): PersistentTask {
    const restoredStatus: TaskStatus =
      task.status === 'running' || task.status === 'queued'
        ? 'waiting'
        : task.status === 'pending'
          ? 'pending'
          : task.status;

    return {
      ...task,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      status: restoredStatus,
      persistenceState: 'restoring',
      timestamps: {
        ...task.timestamps,
        updatedAt: now,
        waitingAt: restoredStatus === 'waiting' ? now : task.timestamps.waitingAt,
      },
      continuity: {
        ...task.continuity,
        executionOwnerLock: null,
        restoreCount: (task.continuity?.restoreCount || 0) + 1,
        recoveryCount: task.continuity?.recoveryCount || 0,
        orphanRecoveryCount: task.continuity?.orphanRecoveryCount || 0,
      },
      restoreGuard: {
        ...task.restoreGuard,
        restoredAt: now,
        restoredByRuntimeId: this.runtimeId,
      },
    };
  }

  private schedulePass(reason: string): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer);
    }

    const nextWakeUp = this.resolveNextWakeUp();
    const delay = Math.max(100, nextWakeUp - Date.now());
    this.schedulerTimer = setTimeout(() => {
      void this.flushReadyTasks(reason);
    }, delay);
  }

  private async flushReadyTasks(reason: string): Promise<void> {
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    this.flushPromise = (async () => {
      const readyTasks = Array.from(this.tasks.values())
        .filter((task) => this.canExecuteTask(task) && this.isTaskReady(task))
        .sort((left, right) => (left.schedule.executeAt || left.timestamps.createdAt) - (right.schedule.executeAt || right.timestamps.createdAt));

      for (const task of readyTasks) {
        await this.enqueueTaskExecution(task.taskId, reason);
      }
    })();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
      this.schedulePass('flush_complete');
    }
  }

  private resolveNextWakeUp(): number {
    const now = Date.now();
    let nextWakeUp = now + 30_000;

    for (const task of this.tasks.values()) {
      if (this.isTerminal(task.status) || task.status === 'paused') {
        continue;
      }
      const candidates = [task.schedule.executeAt, task.schedule.retryAfter, task.schedule.cooldownUntil].filter((value): value is number => Boolean(value));
      for (const candidate of candidates) {
        if (candidate < nextWakeUp) {
          nextWakeUp = candidate;
        }
      }
      if (!candidates.length && task.status === 'pending') {
        nextWakeUp = now;
      }
    }

    return nextWakeUp;
  }

  private canExecuteTask(task: PersistentTask): boolean {
    return task.status === 'pending' || task.status === 'waiting';
  }

  private isTaskReady(task: PersistentTask): boolean {
    const now = Date.now();
    if (task.schedule.expiresAt && now >= task.schedule.expiresAt) {
      return false;
    }
    if (task.schedule.executeAt && now < task.schedule.executeAt) {
      return false;
    }
    if (task.schedule.retryAfter && now < task.schedule.retryAfter) {
      return false;
    }
    if (task.schedule.cooldownUntil && now < task.schedule.cooldownUntil) {
      return false;
    }
    if (task.trigger && !task.trigger.lastSatisfiedAt) {
      return false;
    }
    return true;
  }

  private handleTaskFailure(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const retryCount = task.metrics.retryCount + 1;
    if (retryCount <= task.schedule.maxRetries) {
      this.updateTask(task, 'waiting', {
        retryAfter: Date.now() + FAILURE_BACKOFF_MS * retryCount,
        executionOwnerLock: null,
        waitingAt: Date.now(),
        retryCount,
        lastError: error,
      });
      logger.warn('TASK_RECOVERY', `task_retry_scheduled taskId=${task.taskId} retry=${retryCount} error=${error}`);
      this.persistSnapshot('task_retry');
      this.schedulePass('task_retry');
      this.emit();
      return;
    }

    this.updateTask(task, 'failed', {
      failedAt: Date.now(),
      executionOwnerLock: null,
      retryCount,
      lastError: error,
    });
    logger.error('TASK_EXECUTION', `task_failed taskId=${task.taskId} error=${error}`);
    this.persistSnapshot('task_failed');
    this.emit();
  }

  private updateTask(
    task: PersistentTask,
    status: TaskStatus,
    updates: Partial<{
      queuedAt: number | null;
      startedAt: number | null;
      waitingAt: number | null;
      pausedAt: number | null;
      completedAt: number | null;
      failedAt: number | null;
      cancelledAt: number | null;
      expiredAt: number | null;
      executionOwnerLock: string | null;
      lastExecutionKey: string | null;
      lastQueueAt: number | null;
      lastRunAt: number | null;
      lastCompletionAt: number | null;
      retryAfter: number | null;
      retryCount: number;
      lastError: string | null;
    }>
  ): void {
    const now = Date.now();
    task.status = status;
    task.timestamps.updatedAt = now;
    task.persistenceState = 'memory';
    if (updates.queuedAt !== undefined) task.timestamps.queuedAt = updates.queuedAt;
    if (updates.startedAt !== undefined) task.timestamps.startedAt = updates.startedAt;
    if (updates.waitingAt !== undefined) task.timestamps.waitingAt = updates.waitingAt;
    if (updates.pausedAt !== undefined) task.timestamps.pausedAt = updates.pausedAt;
    if (updates.completedAt !== undefined) task.timestamps.completedAt = updates.completedAt;
    if (updates.failedAt !== undefined) task.timestamps.failedAt = updates.failedAt;
    if (updates.cancelledAt !== undefined) task.timestamps.cancelledAt = updates.cancelledAt;
    if (updates.expiredAt !== undefined) task.timestamps.expiredAt = updates.expiredAt;
    if (updates.executionOwnerLock !== undefined) task.continuity.executionOwnerLock = updates.executionOwnerLock;
    if (updates.lastExecutionKey !== undefined) task.continuity.lastExecutionKey = updates.lastExecutionKey;
    if (updates.lastQueueAt !== undefined) task.continuity.lastQueueAt = updates.lastQueueAt;
    if (updates.lastRunAt !== undefined) task.continuity.lastRunAt = updates.lastRunAt;
    if (updates.lastCompletionAt !== undefined) task.continuity.lastCompletionAt = updates.lastCompletionAt;
    if (updates.retryAfter !== undefined) task.schedule.retryAfter = updates.retryAfter;
    if (updates.retryCount !== undefined) task.metrics.retryCount = updates.retryCount;
    if (updates.lastError !== undefined) task.lastError = updates.lastError;
  }

  private startWatchdog(): void {
    this.watchdogTimer = setInterval(() => {
      this.runIntegrityPass('watchdog');
    }, 15_000);
  }

  private persistSnapshot(reason: string): void {
    if (!runtimeIdentity.requiresPersistentExecution(`task_persist_${reason}`) || !this.currentOwnerId) {
      logger.info('STORAGE_SCOPE', `task_snapshot_persist_skipped reason=${reason} owner=preview`);
      return;
    }

    for (const task of this.tasks.values()) {
      task.persistenceState = 'persisted';
    }

    const snapshot: TaskRuntimeSnapshot = {
      version: SNAPSHOT_VERSION,
      runtimeId: this.runtimeId,
      ownerId: this.currentOwnerId,
      runtimeSessionId: this.currentRuntimeSessionId,
      runtimeDeviceId: runtimeIdentity.getRuntimeDeviceId(),
      updatedAt: Date.now(),
      tasks: Array.from(this.tasks.values()),
    };

    try {
      const checksum = this.computeChecksum(snapshot);
      if (checksum === this.persistChecksum) {
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
      this.persistChecksum = checksum;
      for (const task of this.tasks.values()) {
        task.restoreGuard.lastPersistedChecksum = checksum;
      }
      logger.info('TASK_PERSISTENCE', `snapshot_committed reason=${reason} tasks=${snapshot.tasks.length}`);
      this.logMetrics(reason);
    } catch (error: any) {
      logger.warn('TASK_PERSISTENCE', `snapshot_failed reason=${reason} error=${error?.message || error}`);
    }
  }

  private readSnapshot(key: string): TaskRuntimeSnapshot | null {
    try {
      const scopedKey = getScopedStorageKey(key, this.currentOwnerId);
      if (!scopedKey) {
        return null;
      }
      const raw = window.localStorage.getItem(scopedKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { checksum?: string; data?: TaskRuntimeSnapshot };
      if (!parsed.data || parsed.data.version !== SNAPSHOT_VERSION || !parsed.checksum || !parsed.data.runtimeSessionId) {
        return null;
      }
      if (!runtimeIdentity.hydrationOwnerValidation('task_read_snapshot', {
        ownerId: parsed.data.ownerId,
        runtimeSessionId: parsed.data.runtimeSessionId,
        runtimeDeviceId: parsed.data.runtimeDeviceId,
        allowCrossSessionRestore: true,
      })) {
        logger.warn('SESSION_ISOLATION', `task_snapshot_scope_rejected key=${scopedKey} owner=${parsed.data.ownerId} active=${this.currentOwnerId || 'preview'}`);
        return null;
      }
      if (this.computeChecksum(parsed.data) !== parsed.checksum) {
        logger.warn('TASK_PERSISTENCE', `snapshot_checksum_mismatch key=${scopedKey}`);
        return null;
      }
      this.persistChecksum = parsed.checksum;
      return parsed.data;
    } catch (error: any) {
      logger.warn('TASK_PERSISTENCE', `snapshot_restore_failed key=${key} error=${error?.message || error}`);
      return null;
    }
  }

  private computeChecksum(snapshot: TaskRuntimeSnapshot): string {
    const input = JSON.stringify(snapshot);
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  private buildDedupeKey(ownerId: string, deviceId: string, action: string, executeAt: number | null, triggerType?: string): string {
    return [ownerId, deviceId, action.toLowerCase(), executeAt || 'immediate', triggerType || 'direct'].join(':');
  }

  private findOpenDuplicate(dedupeKey: string): PersistentTask | null {
    for (const task of this.tasks.values()) {
      if (task.continuity.dedupeKey !== dedupeKey) {
        continue;
      }
      if (!this.isTerminal(task.status) && task.status !== 'cancelled') {
        return task;
      }
    }
    return null;
  }

  private cleanupStaleCompletedTasks(now: number): void {
    for (const task of this.tasks.values()) {
      if ((task.status === 'completed' || task.status === 'cancelled' || task.status === 'expired') && task.timestamps.updatedAt < now - COMPLETED_STALE_MS) {
        this.tasks.delete(task.taskId);
      }
    }
  }

  private mapContextEvent(event: RuntimeContextEvent): NonNullable<PersistentTask['trigger']>['type'] | null {
    if (event.action === 'app_opened') return 'app_opened';
    if (event.action === 'charger_connected') return 'charger_connected';
    if (event.action === 'network_restored' || event.action === 'connectivity_changed') return 'connectivity_changed';
    if (event.action === 'headset_connected') return 'headset_connected';
    if (event.action === 'location_placeholder') return 'location_placeholder';
    if (event.action === 'socket_disconnected') return 'socket_disconnected';
    if (event.action === 'startup') return 'startup';
    if (event.action === 'recovery') return 'recovery';
    if (event.action === 'voice_trigger') return 'voice_trigger';
    if (event.action === 'manual') return 'manual';
    if (event.type === 'lifecycle') return 'lifecycle_event';
    return null;
  }

  private isTerminal(status: TaskStatus): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'expired';
  }

  private logMetrics(reason: string): void {
    const metrics: TaskMetricsSnapshot = {
      active_tasks: Array.from(this.tasks.values()).filter((task) => task.status === 'running').length,
      queued_tasks: Array.from(this.tasks.values()).filter((task) => task.status === 'queued').length,
      failed_tasks: Array.from(this.tasks.values()).filter((task) => task.status === 'failed').length,
      recovery_count: Array.from(this.tasks.values()).reduce((sum, task) => sum + task.continuity.recoveryCount, 0),
      retry_count: Array.from(this.tasks.values()).reduce((sum, task) => sum + task.metrics.retryCount, 0),
      delayed_tasks: Array.from(this.tasks.values()).filter((task) => task.continuity.delayed).length,
      suspended_tasks: Array.from(this.tasks.values()).filter((task) => task.status === 'paused' || task.status === 'waiting').length,
    };
    const metricsKey = JSON.stringify(metrics);
    if (metricsKey === this.lastMetricsKey) {
      return;
    }
    this.lastMetricsKey = metricsKey;
    logger.info(
      'TASK_METRICS',
      `reason=${reason} active_tasks=${metrics.active_tasks} queued_tasks=${metrics.queued_tasks} failed_tasks=${metrics.failed_tasks} recovery_count=${metrics.recovery_count} retry_count=${metrics.retry_count} delayed_tasks=${metrics.delayed_tasks} suspended_tasks=${metrics.suspended_tasks}`
    );
  }

  private emit(): void {
    const snapshot = this.getTasks();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const taskRuntime = TaskRuntime.getInstance();
