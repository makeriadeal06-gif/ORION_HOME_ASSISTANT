import { Request, Response } from 'express';

export class AuthService {
  private static instance: AuthService;
  private isLinked = false;
  private lastSync = 0;

  private constructor() {}

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public getStatus() {
    return { linked: this.isLinked, lastSync: this.lastSync };
  }

  public setAuthenticated(status: boolean) {
    this.isLinked = status;
    if (status) this.lastSync = Date.now();
  }
}

export const authService = AuthService.getInstance();
