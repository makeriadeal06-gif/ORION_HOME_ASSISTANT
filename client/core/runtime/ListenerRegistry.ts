/**
 * [LISTENER_REGISTRY]
 * Centralizada os listeners para garantir unicidade e evitar memory leaks.
 */
class ListenerRegistry {
  private static instance: ListenerRegistry;
  private listeners: Map<string, Set<Function>> = new Map();

  private constructor() {}

  public static getInstance(): ListenerRegistry {
    if (!ListenerRegistry.instance) {
      ListenerRegistry.instance = new ListenerRegistry();
    }
    return ListenerRegistry.instance;
  }

  public register(service: string, event: string, callback: Function) {
    const key = `${service}:${event}`;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    const callbacks = this.listeners.get(key)!;
    if (callbacks.has(callback)) {
      console.warn(`[LISTENER_REGISTRY] Duplicate listener detected for ${key}`);
      return false;
    }

    callbacks.add(callback);
    console.log(`[LISTENER_REGISTRY] Registered: ${key}`);
    return true;
  }

  public unregister(service: string, event: string, callback: Function) {
    const key = `${service}:${event}`;
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      callbacks.delete(callback);
      console.log(`[LISTENER_REGISTRY] Unregistered: ${key}`);
    }
  }

  public clearAll(service?: string) {
    if (service) {
      for (const key of this.listeners.keys()) {
        if (key.startsWith(`${service}:`)) {
          this.listeners.delete(key);
        }
      }
      console.log(`[LISTENER_REGISTRY] Cleared all for service: ${service}`);
    } else {
      this.listeners.clear();
      console.log(`[LISTENER_REGISTRY] Registry fully cleared`);
    }
  }
}

export const listenerRegistry = ListenerRegistry.getInstance();
