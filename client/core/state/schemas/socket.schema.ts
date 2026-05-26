export interface SocketInfrastructure {
  connected: boolean;
  transport: string;
}

export interface SocketState {
  infrastructure: SocketInfrastructure;
}
