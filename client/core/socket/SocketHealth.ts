import { socketRuntime } from './SocketRuntime';
import { logger } from '../logger/Logger';

export class SocketHealth {
  private static latencyInterval: any = null;

  public static startMonitoring() {
    if (this.latencyInterval) return;

    this.latencyInterval = setInterval(() => {
      const socket = socketRuntime.getSocket();
      if (socket?.connected) {
        const start = Date.now();
        socket.emit('ping', () => {
          const latency = Date.now() - start;
          if (latency > 200) {
            logger.warn('SOCKET_HEALTH', `High latency detected: ${latency}ms`);
          }
        });
      }
    }, 30000);
  }

  public static stopMonitoring() {
    if (this.latencyInterval) {
      clearInterval(this.latencyInterval);
      this.latencyInterval = null;
    }
  }
}
