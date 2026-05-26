import { apiClient } from '../client/ApiClient';

export interface AuthStatus {
  linked: boolean;
  lastSync: number;
}

export const authApi = {
  getStatus: () => apiClient.get<AuthStatus>('/auth/status'),
  syncSession: (isAuthenticated: boolean) => apiClient.post('/auth/session', { isAuthenticated }),
  logout: () => apiClient.post('/auth/logout')
};
