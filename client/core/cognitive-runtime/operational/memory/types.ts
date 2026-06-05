// FREEZE_PHASE_09_OPERATIONAL_MEMORY
export interface MemoryEvent {
  id: string;
  type: string;
  source: string;
  payload: any;
  timestamp: number;
}

export interface MemoryQuery {
  type?: string;
  source?: string;
  since?: number;
}

export interface OperationalContextSnapshot {
  batteryTrend: 'rising' | 'falling' | 'stable';
  temperatureTrend: 'rising' | 'falling' | 'stable';
  lastModeChangeAt: number | null;
  recentSituationsCount: number;
}
