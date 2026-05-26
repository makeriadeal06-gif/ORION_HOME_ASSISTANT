import { CognitiveIntent, CognitiveState } from '../types';
import { cognitiveEventBus } from '../bus/CognitiveEventBus';
import { cognitiveStateEngine } from '../state/CognitiveStateEngine';
import { actionArbitration } from '../arbitration/ActionArbitration';
import { cognitiveMemory } from '../memory/CognitiveMemoryLayer';
import { logger } from '../../logger/Logger';
import { commandQueue } from '@core/command-runtime/execution/CommandExecutionQueue';
import { CommandStatus, CommandType } from '@core/command-runtime/types';
import { taskRuntime } from '@core/task-runtime/TaskRuntime';
import { presenceRuntime } from '@core/presence/PresenceRuntime';

export class IntentPipeline {
  private static instance: IntentPipeline;

  private constructor() {}

  public static getInstance(): IntentPipeline {
    if (!IntentPipeline.instance) {
      IntentPipeline.instance = new IntentPipeline();
    }
    return IntentPipeline.instance;
  }

  public async receive(intent: CognitiveIntent) {
    const pipelineStartedAt = Date.now();
    logger.info('INTENT_PIPELINE', 'intent received: ' + intent.type);
    logger.info('COGNITIVE_RUNTIME', 'intent processing started for: ' + intent.id);
    cognitiveEventBus.emit('cognition:intent_received', intent);
    
    const token = cognitiveStateEngine.transitionTo(CognitiveState.THINKING, 10000);
    if (!token) {
      logger.warn('COGNITIVE_RUNTIME', 'Intent rejected: Engine cannot transition to THINKING.');
      return;
    }

    cognitiveMemory.recordIntent(intent.id);
    intent.status = 'VALIDATING';
    logger.info('INTENT_PIPELINE', 'intent validated');

    if (token.isCancelled) return;

    logger.info('ARBITRATION', 'validating intent: ' + intent.id);
    const isSafe = actionArbitration.validateIntent(intent);
    logger.info('ARBITRATION', 'arbitration result: ' + (isSafe ? 'PASSED' : 'REJECTED'));
    if (!isSafe) {
      intent.status = 'REJECTED';
      if (!token.isCancelled) cognitiveStateEngine.resetToIdle();
      return;
    }

    // 2. Decision Phase (Simulated Cognitive Delay for now)
    intent.status = 'DECIDING';
    presenceRuntime.setCognitiveState('processing', 'intent_deciding');
    await new Promise(resolve => setTimeout(resolve, 40));
    if (token.isCancelled) return;

    // 3. Execution Phase
    const execToken = cognitiveStateEngine.transitionTo(CognitiveState.EXECUTING, 30000);
    if (!execToken) {
      logger.error('COGNITIVE_RUNTIME', 'Failed to transition to EXECUTING for intent ' + intent.id);
      if (!token.isCancelled) cognitiveStateEngine.resetToIdle();
      return;
    }
    
    if (execToken.isCancelled) return;
    
    intent.status = 'EXECUTING';
    presenceRuntime.setCognitiveState('executing', 'intent_executing');
    cognitiveEventBus.emit('cognition:executing', intent);

    try {
      if (intent.type === 'COMMAND' && intent.payload?.deviceId) {
        cognitiveMemory.recordAction('DEVICE', intent.payload.deviceId);
        
        const actionToUse = intent.payload.action || intent.payload.normalizedText || 'desconhecido';
        const taskTiming = intent.payload?.taskTiming;

        if (taskTiming?.isDelayed && intent.payload?.triggerUserId) {
          logger.info(
            'VOICE_SCHEDULER',
            `intent=${intent.id} delayed=true kind=${taskTiming.timingKind || 'unknown'} executeAt=${taskTiming.executeAt || 'none'} executeAfterMs=${taskTiming.executeAfterMs || 0} cleaned="${taskTiming.cleanedText}" action="${actionToUse}"`,
          );
          const task = taskRuntime.createTask({
            ownerId: intent.payload.triggerUserId,
            userId: intent.payload.triggerUserId,
            source: intent.source || 'VOICE',
            correlationId: intent.id,
            request: {
              type: CommandType.TRIGGER_CMD,
              deviceId: intent.payload.deviceId,
              action: actionToUse,
              payload: intent.payload,
            },
            executeAfterMs: taskTiming.executeAfterMs,
            executeAt: taskTiming.executeAt,
            retryAfter: taskTiming.retryAfter,
            cooldownUntil: taskTiming.cooldownUntil,
            trigger: {
              type: 'voice_trigger',
              value: taskTiming.cleanedText || actionToUse,
              requiresAuthorization: true,
            },
          });

          logger.info(
            'TASK_TEMPORAL',
            `task_created intent=${intent.id} taskId=${task.taskId} executeAt=${task.schedule.executeAt || 'none'} delayed=${task.continuity.delayed} action="${actionToUse}"`,
          );
          logger.info(
            'TEMPORAL_EXECUTION',
            `persisted_temporal_intent intent=${intent.id} taskId=${task.taskId} immediate_fallback=false`,
          );

          intent.status = 'COMPLETED';
          cognitiveEventBus.emit('cognition:execution_finished', {
            intent,
            task,
            metrics: {
              pipelineStartedAt,
              executionStartedAt: Date.now(),
              executionFinishedAt: Date.now(),
            },
          });
          logger.info('TASK_RUNTIME', `task_created_from_intent intent=${intent.id} taskId=${task.taskId}`);
          return;
        }

        logger.info('VOICE_SCHEDULER', `intent=${intent.id} delayed=false queue_path=immediate action="${actionToUse}"`);
        
        const commandReq = {
           id: intent.id,
           type: CommandType.TRIGGER_CMD,
           deviceId: intent.payload.deviceId,
           action: actionToUse,
           payload: intent.payload,
           timestamp: Date.now()
        };
        
        logger.info('VOICE_DISPATCH', `queue_enqueue id=${intent.id} deviceId=${intent.payload.deviceId} action="${actionToUse}"`);
        const executionStartedAt = Date.now();
        const response = await commandQueue.enqueue(commandReq);
        logger.info(
          'VOICE_EXECUTION',
          `queue_result status=${response.status} message=${response.message || 'none'} commandId=${response.commandId}`
        );

        if (response.status !== CommandStatus.SUCCESS) {
          throw new Error(response.message || 'TRIGGER_EXECUTION_FAILED');
        }

        if (execToken.isCancelled) return;

        intent.status = 'COMPLETED';
        cognitiveEventBus.emit('cognition:execution_finished', {
          intent,
          response,
          metrics: {
            pipelineStartedAt,
            executionStartedAt,
            executionFinishedAt: Date.now(),
          },
        });
        logger.info('VOICE_EXECUTION', 'completed execution for intent: ' + intent.id);
        return;
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (execToken.isCancelled) return;
      
      intent.status = 'COMPLETED';
      cognitiveEventBus.emit('cognition:execution_finished', {
        intent,
        metrics: {
          pipelineStartedAt,
          executionStartedAt: pipelineStartedAt,
          executionFinishedAt: Date.now(),
        },
      });
      logger.info('VOICE_EXECUTION', 'completed execution for intent: ' + intent.id);
    } catch (e: any) {
      intent.status = 'FAILED';
      logger.error('VOICE_EXECUTION', 'failed execution for intent: ' + intent.id + '. Error: ' + e.message);
    } finally {
      if (!execToken.isCancelled) {
        cognitiveStateEngine.resetToIdle();
      }
    }
  }
}

export const intentPipeline = IntentPipeline.getInstance();
