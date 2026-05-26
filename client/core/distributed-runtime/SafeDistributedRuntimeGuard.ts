import { logger } from '../logger/Logger';

/**
 * [SAFE_RUNTIME_GUARD]
 * Protetor central contra undefined access e null pointer exceptions
 * no ambiente distribuído do ORION.
 */
export class SafeDistributedRuntimeGuard {
  
  public static safeSplit(value: string | null | undefined, separator: string, index: number = 0): string {
    if (!value || typeof value !== 'string') return '';
    try {
      const parts = (value ?? "").split(separator);
      return parts[index] || '';
    } catch (e) {
      return '';
    }
  }

  public static safeMap<T, R>(list: T[] | null | undefined, mapper: (item: T) => R): R[] {
    if (!list || !Array.isArray(list)) return [];
    try {
      return list.map(mapper);
    } catch (e) {
      logger.error('SAFE_GUARD', 'Map execution failure', e);
      return [];
    }
  }

  public static safeFilter<T>(list: T[] | null | undefined, predicate: (item: T) => boolean): T[] {
    if (!list || !Array.isArray(list)) return [];
    try {
      return list.filter(predicate);
    } catch (e) {
      logger.error('SAFE_GUARD', 'Filter execution failure', e);
      return [];
    }
  }

  public static safeTransform(value: string | null | undefined, mode: 'lower' | 'upper'): string {
    if (!value || typeof value !== 'string') return '';
    return mode === 'lower' ? value.toLowerCase() : value.toUpperCase();
  }

  public static validateNodeId(id: string | null | undefined): boolean {
    if (!id || typeof id !== 'string') return false;
    return id.length > 5 && id.includes('_');
  }
}
