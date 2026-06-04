export enum CognitiveModeType {
  BALANCED = 'BALANCED',
  FOCUS = 'FOCUS',
  PROFESSIONAL = 'PROFESSIONAL',
  SILENT = 'SILENT',
  CASUAL = 'CASUAL'
}

export interface CognitiveMode {
  type: CognitiveModeType;
  name: string;
  description: string;
  preferences: {
    priorityLevel: number; // 1 (low) to 5 (high)
    allowAutoIntervention: boolean;
    resourceSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    notificationLevel: 'NONE' | 'MINIMAL' | 'NORMAL';
  };
}

export interface CognitiveModeState {
  activeMode: CognitiveModeType;
  lastChangedAt: number;
}
