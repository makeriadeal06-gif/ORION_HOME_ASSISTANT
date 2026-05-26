import { SystemState } from '../schemas/system.schema';

export const selectInfrastructure = (state: SystemState) => state.infrastructure;
export const selectModules = (state: SystemState) => state.modules;
export const selectCpuPressure = (state: SystemState) => state.cpuPressure;
export const selectIsAuthenticating = (state: SystemState) => state.isAuthenticating;
export const selectCurrentView = (state: SystemState) => state.currentView;
export const selectEventQueueSize = (state: SystemState) => state.eventQueueSize;
