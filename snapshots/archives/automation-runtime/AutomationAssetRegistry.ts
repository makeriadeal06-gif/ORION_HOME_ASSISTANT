import { TriggerDevice } from '@core/runtime/TriggerManager';
import { logger } from '@core/logger/Logger';
import { runtimeIdentity } from '@core/runtime/RuntimeIdentity';
import { getScopedStorageValue, setScopedStorageValue } from '@core/runtime/ScopedBrowserStorage';

const EXECUTABLE_REGISTRY_KEY = 'orion.automation.executables.v1';
const TRIGGER_METADATA_KEY = 'orion.automation.trigger-registry.v1';

export interface ExecutableRegistryEntry {
  id: string;
  path: string;
  label: string;
  category: string;
  icon?: string;
  provider: 'system_bridge' | 'triggercmd';
  updatedAt: number;
  createdAt: number;
}

export interface TriggerRegistryEntry extends TriggerDevice {
  aliases: string[];
  provider: string;
  source: string;
  app: string;
  category: string;
}

type TriggerMetadataRecord = Record<string, {
  aliases?: string[];
  category?: string;
  app?: string;
}>;

class AutomationAssetRegistry {
  public listExecutables(): ExecutableRegistryEntry[] {
    return this.readExecutables().sort((left, right) => left.label.localeCompare(right.label));
  }

  public saveExecutable(input: Omit<ExecutableRegistryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ExecutableRegistryEntry {
    if (!runtimeIdentity.requiresPersistentExecution('save_executable_registry')) {
      throw new Error('PREVIEW_MODE_PERSISTENCE_BLOCKED');
    }

    const normalizedPath = normalizeExecutablePath(input.path);
    if (!isExecutablePathValid(normalizedPath)) {
      throw new Error('INVALID_EXECUTABLE_PATH');
    }

    const items = this.readExecutables();
    const now = Date.now();
    const existing = items.find((entry) => entry.id === input.id || entry.path.toLowerCase() === normalizedPath.toLowerCase());
    const next: ExecutableRegistryEntry = {
      id: existing?.id || `executable_${Math.random().toString(36).slice(2)}_${now}`,
      path: normalizedPath,
      label: (input.label || extractExecutableLabel(normalizedPath)).trim(),
      category: (input.category || 'desktop').trim() || 'desktop',
      icon: input.icon?.trim() || undefined,
      provider: input.provider,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const nextItems = existing
      ? items.map((entry) => (entry.id === existing.id ? next : entry))
      : [...items, next];
    this.writeExecutables(nextItems);
    return next;
  }

  public listTriggerEntries(devices: TriggerDevice[]): TriggerRegistryEntry[] {
    const metadata = this.readTriggerMetadata();
    return devices.map((device) => {
      const overlay = metadata[device.id] || {};
      return {
        ...device,
        aliases: sanitizeAliases(overlay.aliases || device.aliases || []),
        provider: device.provider || 'TriggerCMD',
        source: device.source || device.server,
        app: (overlay.app || device.app || inferApp(device)).trim(),
        category: (overlay.category || device.category || inferCategory(device)).trim(),
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
  }

  public saveTriggerMetadata(deviceId: string, updates: { aliases?: string[]; category?: string; app?: string }): TriggerMetadataRecord[string] {
    if (!runtimeIdentity.requiresPersistentExecution('save_trigger_metadata')) {
      throw new Error('PREVIEW_MODE_PERSISTENCE_BLOCKED');
    }

    const metadata = this.readTriggerMetadata();
    const current = metadata[deviceId] || {};
    const next = {
      aliases: updates.aliases ? sanitizeAliases(updates.aliases) : current.aliases || [],
      category: (updates.category ?? current.category ?? '').trim(),
      app: (updates.app ?? current.app ?? '').trim(),
    };
    metadata[deviceId] = next;
    this.writeTriggerMetadata(metadata);
    return next;
  }

  private readExecutables(): ExecutableRegistryEntry[] {
    try {
      const raw = getScopedStorageValue(EXECUTABLE_REGISTRY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ExecutableRegistryEntry[];
      return Array.isArray(parsed) ? parsed.filter((entry) => entry?.path).map((entry) => ({ ...entry, path: normalizeExecutablePath(entry.path) })) : [];
    } catch {
      return [];
    }
  }

  private writeExecutables(items: ExecutableRegistryEntry[]): void {
    setScopedStorageValue(EXECUTABLE_REGISTRY_KEY, JSON.stringify(items));
    logger.info('STORAGE_SCOPE', `executable_registry_persisted owner=${runtimeIdentity.getOwnerId() || 'preview'} items=${items.length}`);
  }

  private readTriggerMetadata(): TriggerMetadataRecord {
    try {
      const raw = getScopedStorageValue(TRIGGER_METADATA_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as TriggerMetadataRecord;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeTriggerMetadata(items: TriggerMetadataRecord): void {
    setScopedStorageValue(TRIGGER_METADATA_KEY, JSON.stringify(items));
    logger.info('STORAGE_SCOPE', `trigger_registry_persisted owner=${runtimeIdentity.getOwnerId() || 'preview'} items=${Object.keys(items).length}`);
  }
}

function sanitizeAliases(aliases: string[]): string[] {
  return aliases.map((entry) => entry.trim()).filter(Boolean);
}

function inferApp(device: TriggerDevice): string {
  return device.app || extractExecutableLabel(device.cmd || device.name);
}

function inferCategory(device: TriggerDevice): string {
  const base = `${device.name} ${device.cmd}`.toLowerCase();
  if (base.includes('spotify') || base.includes('discord') || base.includes('steam')) return 'app';
  if (base.includes('bluetooth') || base.includes('headset')) return 'device';
  return 'automation';
}

export function normalizeExecutablePath(path: string): string {
  return path.trim().replace(/\//g, '\\');
}

export function isExecutablePathValid(path: string): boolean {
  if (!path) return false;
  const windowsPath = /^[a-zA-Z]:\\.+/;
  const shortcut = /\.(exe|bat|cmd|ps1|lnk|url|appref-ms)$/i;
  return windowsPath.test(path) && shortcut.test(path);
}

function extractExecutableLabel(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  const fileName = parts[parts.length - 1] || path;
  return fileName.replace(/\.[^.]+$/, '');
}

export const automationAssetRegistry = new AutomationAssetRegistry();
