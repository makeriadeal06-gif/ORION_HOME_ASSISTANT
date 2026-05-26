export interface GoogleHomeInfrastructure {
  linked: boolean;
  lastSync: number;
}

export interface GoogleState {
  infrastructure: GoogleHomeInfrastructure;
  isAuthenticating: boolean;
}
