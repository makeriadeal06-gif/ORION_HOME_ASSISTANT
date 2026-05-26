export interface MqttInfrastructure {
  connected: boolean;
  broker: string;
  mqttMode: 'REALTIME' | 'VIRTUAL';
  mqttRecoveryState: 'STABLE' | 'UNSTABLE' | 'RECOVERING' | 'FAILED';
  reconnectAttempts: number;
  circuitBreakerState: 'CLOSED' | 'OPEN';
  lastSuccessfulHandshake: number;
}

export interface MqttState {
  infrastructure: MqttInfrastructure;
}
