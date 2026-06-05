import { AndroidActionType } from './types';

/**
 * Registry of all supported Android actions and their default parameters.
 */
export const AndroidActionRegistry = {
  [AndroidActionType.ENABLE_POWER_SAVE]: {
    description: 'Enables system-wide power saving mode',
    defaultParams: { force: true }
  },
  [AndroidActionType.DISABLE_POWER_SAVE]: {
    description: 'Disables system-wide power saving mode',
    defaultParams: {}
  },
  [AndroidActionType.REDUCE_BRIGHTNESS]: {
    description: 'Reduces screen brightness to conserve energy',
    defaultParams: { level: 0.3 }
  },
  [AndroidActionType.RESTORE_BRIGHTNESS]: {
    description: 'Restores screen brightness to normal levels',
    defaultParams: { level: 0.8 }
  },
  [AndroidActionType.ENABLE_DO_NOT_DISTURB]: {
    description: 'Enables Do Not Disturb mode',
    defaultParams: { priorityOnly: true }
  },
  [AndroidActionType.DISABLE_DO_NOT_DISTURB]: {
    description: 'Disables Do Not Disturb mode',
    defaultParams: {}
  },
  [AndroidActionType.REDUCE_BACKGROUND_ACTIVITY]: {
    description: 'Limits background sync and processing',
    defaultParams: { aggressive: true }
  },
  [AndroidActionType.RESTORE_BACKGROUND_ACTIVITY]: {
    description: 'Restores normal background sync intervals',
    defaultParams: {}
  }
};
