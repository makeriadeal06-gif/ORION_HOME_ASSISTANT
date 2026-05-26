import { runtimeIdentity } from './RuntimeIdentity';

export function getScopedStorageKey(namespace: string, ownerId = runtimeIdentity.getOwnerId()): string | null {
  if (!ownerId) {
    return null;
  }

  return `${namespace}_${ownerId}`;
}

export function getScopedStorageValue(namespace: string, ownerId = runtimeIdentity.getOwnerId()): string | null {
  const key = getScopedStorageKey(namespace, ownerId);
  if (!key) {
    return null;
  }

  return window.localStorage.getItem(key);
}

export function setScopedStorageValue(namespace: string, value: string, ownerId = runtimeIdentity.getOwnerId()): boolean {
  const key = getScopedStorageKey(namespace, ownerId);
  if (!key) {
    return false;
  }

  window.localStorage.setItem(key, value);
  return true;
}

export function removeScopedStorageValue(namespace: string, ownerId = runtimeIdentity.getOwnerId()): boolean {
  const key = getScopedStorageKey(namespace, ownerId);
  if (!key) {
    return false;
  }

  window.localStorage.removeItem(key);
  return true;
}
