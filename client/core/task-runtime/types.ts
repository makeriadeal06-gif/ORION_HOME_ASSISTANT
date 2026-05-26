import { CommandRequest, CommandType } from '@core/command-runtime/types';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type TaskPersistenceState = 'memory' | 'persisted' | 'restoring';

export type TaskContextTriggerType =
  | 'app_opened'
  | 'charger_connected'
  | 'connectivity_changed'
  | 'headset_connected'
  | 'location_placeholder'
  | 'lifecycle_event'
  | 'socket_disconnected'
  | 'startup'
  | 'recovery'
  | 'voice_trigger'
  | 'manual';

export interface TaskContextTrigger {
  type: TaskContextTriggerType;
  value?: string;
  requiresAuthorization: boolean;
  lastSatisfiedAt: number | null;
}

export interface TaskContinuityMetadata {
  dedupeKey: string;
  executionOwnerLock: string | null;
  lastExecutionKey: string | null;
  lastQueueAt: number | null;
  lastRunAt: number | null;
  lastCompletionAt: number | null;
  lastLifecycleEvent: string | null;
  lastLifecycleAt: number | null;
  lastContextEvent: string | null;
  lastContextEventAt: number | null;
  restoreCount: number;
  recoveryCount: number;
  orphanRecoveryCount: number;
  delayed: boolean;
}

export interface TaskTimestamps {
  createdAt: number;
  updatedAt: number;
  queuedAt: number | null;
  startedAt: number | null;
  waitingAt: number | null;
  pausedAt: number | null;
  completedAt: number | null;
  failedAt: number | null;
  cancelledAt: number | null;
  expiredAt: number | null;
}

export interface PersistentTask {
  taskId: string;
  correlationId: string;
  ownerId: string;
  userId: string;
  runtimeSessionId: string;
  runtimeDeviceId: string;
  source: string;
  status: TaskStatus;
  request: Pick<CommandRequest, 'type' | 'deviceId' | 'action' | 'payload'>;
  trigger: TaskContextTrigger | null;
  timestamps: TaskTimestamps;
  schedule: {
    executeAt: number | null;
    retryAfter: number | null;
    cooldownUntil: number | null;
    timeoutMs: number;
    expiresAt: number | null;
    maxRetries: number;
  };
  metrics: {
    retryCount: number;
  };
  persistenceState: TaskPersistenceState;
  continuity: TaskContinuityMetadata;
  restoreGuard: {
    restoredAt: number | null;
    restoredByRuntimeId: string | null;
    lastPersistedChecksum: string | null;
  };
  lastError: string | null;
}

export interface TaskRuntimeSnapshot {
  version: 1;
  runtimeId: string;
  ownerId: string;
  runtimeSessionId: string;
  runtimeDeviceId?: string;
  updatedAt: number;
  tasks: PersistentTask[];
}

export interface CreateTaskInput {
  ownerId: string;
  userId: string;
  source: string;
  correlationId?: string;
  request: Pick<CommandRequest, 'type' | 'deviceId' | 'action' | 'payload'>;
  executeAfterMs?: number;
  executeAt?: number;
  retryAfter?: number;
  cooldownUntil?: number;
  timeoutMs?: number;
  maxRetries?: number;
  expiresAt?: number;
  trigger?: Omit<TaskContextTrigger, 'lastSatisfiedAt'>;
}

export interface TaskTimingDirective {
  executeAfterMs?: number;
  executeAt?: number;
  retryAfter?: number;
  cooldownUntil?: number;
  cleanedText: string;
  isDelayed: boolean;
  timingKind?: 'relative' | 'absolute_time' | 'tomorrow' | 'weekday';
  matchedText?: string | null;
}

export interface TaskMetricsSnapshot {
  active_tasks: number;
  queued_tasks: number;
  failed_tasks: number;
  recovery_count: number;
  retry_count: number;
  delayed_tasks: number;
  suspended_tasks: number;
}

export function buildTaskCommandRequest(task: PersistentTask): CommandRequest {
  return {
    id: task.taskId,
    type: task.request.type as CommandType,
    deviceId: task.request.deviceId,
    action: task.request.action,
    payload: task.request.payload,
    timestamp: Date.now(),
    taskContext: {
      taskId: task.taskId,
      correlationId: task.correlationId,
      ownerId: task.ownerId,
    },
  };
}
