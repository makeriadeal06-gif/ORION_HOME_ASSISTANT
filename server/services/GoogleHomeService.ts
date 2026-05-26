import { Server } from 'socket.io';

type DeviceTrait = {
  name: string;
  value: unknown;
  updatedAt: number;
};

type OrionDevice = {
  id: string;
  name: string;
  type: string;
  room?: string;
  status: string;
  activity: string;
  lastSeen: number;
  traits: Record<string, DeviceTrait>;
  metadata: {
    manufacturer?: string;
    model?: string;
    hwVersion?: string;
    swVersion?: string;
  };
};

type IntegrationSource = 'REAL' | 'MOCK';

const MOCK_DEVICES: OrionDevice[] = [
  {
    id: 'gh_light_01',
    name: 'Living Room Light',
    type: 'LIGHT',
    room: 'Living Room',
    status: 'ONLINE',
    activity: 'IDLE',
    lastSeen: Date.now(),
    traits: {
      brightness: { name: 'brightness', value: 80, updatedAt: Date.now() },
      color: { name: 'color', value: '#FFFFFF', updatedAt: Date.now() }
    },
    metadata: { manufacturer: 'Philips', model: 'Hue White' }
  },
  {
    id: 'gh_tv_01',
    name: 'Main TV',
    type: 'TV',
    room: 'Living Room',
    status: 'ONLINE',
    activity: 'ACTIVE',
    lastSeen: Date.now(),
    traits: {
      volume: { name: 'volume', value: 25, updatedAt: Date.now() },
      activeApp: { name: 'activeApp', value: 'Youtube', updatedAt: Date.now() }
    },
    metadata: { manufacturer: 'Samsung', model: 'QLED 4K' }
  },
  {
    id: 'gh_outlet_01',
    name: 'Coffee Maker',
    type: 'OUTLET',
    room: 'Kitchen',
    status: 'OFFLINE',
    activity: 'UNKNOWN',
    lastSeen: Date.now() - 3600000,
    traits: {
      power: { name: 'power', value: false, updatedAt: Date.now() }
    },
    metadata: { manufacturer: 'TP-Link', model: 'Kasa Smart' }
  },
  {
    id: 'gh_speaker_01',
    name: 'Kitchen Speaker',
    type: 'SPEAKER',
    room: 'Kitchen',
    status: 'ONLINE',
    activity: 'IDLE',
    lastSeen: Date.now(),
    traits: {
      volume: { name: 'volume', value: 40, updatedAt: Date.now() }
    },
    metadata: { manufacturer: 'Google', model: 'Nest Mini' }
  }
];

const GOOGLE_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const GOOGLE_STALE_MS = 2 * 60 * 1000;

export class GoogleHomeService {
  private static instance: GoogleHomeService;
  private io: Server | null = null;
  private devicesCache: OrionDevice[] = this.cloneMockDevices();
  private lastSync = 0;
  private source: IntegrationSource = 'MOCK';
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private lastEmitSignature = '';
  private failureCount = 0;

  private constructor() {}

  public static getInstance(): GoogleHomeService {
    if (!GoogleHomeService.instance) {
      GoogleHomeService.instance = new GoogleHomeService();
    }
    return GoogleHomeService.instance;
  }

  public init(io: Server) {
    this.io = io;

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refreshEcosystem('interval').catch(() => {
          // handled inside refresh
        });
      }, GOOGLE_REFRESH_INTERVAL_MS);
    }

    this.refreshEcosystem('startup').catch(() => {
      // handled inside refresh
    });
  }

  public async getEcosystemSnapshot(): Promise<OrionDevice[]> {
    if (Date.now() - this.lastSync > GOOGLE_STALE_MS) {
      this.refreshEcosystem('stale-request').catch(() => {
        // handled inside refresh
      });
    }

    return this.devicesCache;
  }

  public getCachedDevices(): OrionDevice[] {
    return this.devicesCache;
  }

  private async refreshEcosystem(reason: string) {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }

    this.refreshInFlight = this.performRefresh(reason)
      .catch(() => {
        // handled inside performRefresh
      })
      .finally(() => {
        this.refreshInFlight = null;
      });

    await this.refreshInFlight;
  }

  private async performRefresh(reason: string) {
    const realDevices = await this.fetchRealDevices();
    const resolvedDevices = realDevices.length > 0 ? realDevices : this.cloneMockDevices();
    const resolvedSource: IntegrationSource = realDevices.length > 0 ? 'REAL' : 'MOCK';

    this.lastSync = Date.now();
    this.source = resolvedSource;
    this.updateCache(resolvedDevices, reason);
  }

  private updateCache(devices: OrionDevice[], reason: string) {
    if (!Array.isArray(devices)) {
      return;
    }

    const normalized = devices.filter(Boolean);
    const signature = this.buildSignature(normalized);
    const changed = signature !== this.lastEmitSignature;

    this.devicesCache = normalized;

    if (changed) {
      this.lastEmitSignature = signature;
      this.io?.emit('google:device_sync', normalized);
      console.log(`[GOOGLE_HOME] Sync update (${this.source}) devices=${normalized.length} reason=${reason}`);
    }
  }

  private async fetchRealDevices(): Promise<OrionDevice[]> {
    try {
      const customEndpointDevices = await this.fetchFromCustomEndpoint();
      if (customEndpointDevices.length > 0) {
        this.failureCount = 0;
        return customEndpointDevices;
      }

      const sdmDevices = await this.fetchFromSdm();
      if (sdmDevices.length > 0) {
        this.failureCount = 0;
        return sdmDevices;
      }

      this.failureCount++;
      if (this.failureCount % 5 === 1) {
        console.warn('[GOOGLE_HOME] Real integration unavailable. Using fallback snapshot.');
      }
      return [];
    } catch (error) {
      this.failureCount++;
      if (this.failureCount % 5 === 1) {
        const msg = error instanceof Error ? error.message : 'unknown_error';
        console.warn(`[GOOGLE_HOME] Real integration failed (${msg}). Using fallback snapshot.`);
      }
      return [];
    }
  }

  private async fetchFromCustomEndpoint(): Promise<OrionDevice[]> {
    const endpoint = process.env.GOOGLE_HOME_DEVICES_URL;
    if (!endpoint) {
      return [];
    }

    const token = process.env.GOOGLE_HOME_ACCESS_TOKEN || process.env.GOOGLE_API_ACCESS_TOKEN || '';
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      throw new Error(`custom_endpoint_${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload
      .map((raw) => this.normalizeDevice(raw))
      .filter((device): device is OrionDevice => device !== null);
  }

  private async fetchFromSdm(): Promise<OrionDevice[]> {
    const enterpriseId = process.env.GOOGLE_SDM_ENTERPRISE_ID;
    const token = process.env.GOOGLE_SDM_ACCESS_TOKEN || process.env.GOOGLE_HOME_ACCESS_TOKEN;

    if (!enterpriseId || !token) {
      return [];
    }

    const endpoint = `https://smartdevicemanagement.googleapis.com/v1/enterprises/${enterpriseId}/devices`;
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`sdm_${response.status}`);
    }

    const payload = await response.json() as { devices?: unknown[] };
    if (!payload || !Array.isArray(payload.devices)) {
      return [];
    }

    return payload.devices
      .map((raw) => this.normalizeSdmDevice(raw))
      .filter((device): device is OrionDevice => device !== null);
  }

  private normalizeSdmDevice(raw: unknown): OrionDevice | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Record<string, unknown>;
    const name = this.toStringValue(candidate.name) || '';
    const shortName = name.split('/').pop() || 'unknown';

    const traits = this.toObject(candidate.traits);
    const parentRelations = Array.isArray(candidate.parentRelations) ? candidate.parentRelations : [];
    const info = this.toObject(parentRelations[0]);
    const roomName = this.toStringValue(info.displayName) || undefined;

    const type = this.mapSdmType(this.toStringValue(candidate.type));
    const online = this.isSdmOnline(traits);
    const activity = online ? 'IDLE' : 'UNKNOWN';

    return {
      id: `sdm_${shortName}`,
      name: this.toStringValue(candidate.customName) || shortName,
      type,
      room: roomName,
      status: online ? 'ONLINE' : 'OFFLINE',
      activity,
      lastSeen: Date.now(),
      traits: this.normalizeTraits(traits),
      metadata: {
        manufacturer: this.toStringValue(candidate.assignee) || undefined,
        model: this.toStringValue(candidate.type) || undefined
      }
    };
  }

  private normalizeDevice(raw: unknown): OrionDevice | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const device = raw as Record<string, unknown>;
    const id = this.toStringValue(device.id);
    const name = this.toStringValue(device.name);
    const type = this.toStringValue(device.type);

    if (!id || !name || !type) {
      return null;
    }

    const traits = this.normalizeTraits(this.toObject(device.traits));
    const metadata = this.toObject(device.metadata);

    return {
      id,
      name,
      type: type.toUpperCase(),
      room: this.toStringValue(device.room) || undefined,
      status: this.toStatus(device.status),
      activity: this.toActivity(device.activity),
      lastSeen: this.toNumber(device.lastSeen) || Date.now(),
      traits,
      metadata: {
        manufacturer: this.toStringValue(metadata.manufacturer) || undefined,
        model: this.toStringValue(metadata.model) || undefined,
        hwVersion: this.toStringValue(metadata.hwVersion) || undefined,
        swVersion: this.toStringValue(metadata.swVersion) || undefined
      }
    };
  }

  private normalizeTraits(traitsInput: Record<string, unknown>): Record<string, DeviceTrait> {
    const traits: Record<string, DeviceTrait> = {};
    const now = Date.now();

    Object.entries(traitsInput).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        const traitObj = value as Record<string, unknown>;
        traits[key] = {
          name: this.toStringValue(traitObj.name) || key,
          value: traitObj.value,
          updatedAt: this.toNumber(traitObj.updatedAt) || now
        };
      } else {
        traits[key] = {
          name: key,
          value,
          updatedAt: now
        };
      }
    });

    return traits;
  }

  private buildSignature(devices: OrionDevice[]) {
    return JSON.stringify(
      devices
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((device) => {
          const traitValues = Object.fromEntries(
            Object.entries(device.traits)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, trait]) => [key, trait?.value])
          );

          return {
            id: device.id,
            status: device.status,
            activity: device.activity,
            type: device.type,
            room: device.room || '',
            traits: traitValues
          };
        })
    );
  }

  private cloneMockDevices(): OrionDevice[] {
    const now = Date.now();
    return MOCK_DEVICES.map((device) => ({
      ...device,
      lastSeen: device.status === 'ONLINE' ? now : device.lastSeen,
      traits: Object.fromEntries(
        Object.entries(device.traits).map(([key, trait]) => [
          key,
          {
            ...trait,
            updatedAt: now
          }
        ])
      )
    }));
  }

  private mapSdmType(type?: string | null): string {
    if (!type) return 'UNKNOWN';
    const normalized = type.toLowerCase();
    if (normalized.includes('thermostat')) return 'THERMOSTAT';
    if (normalized.includes('camera')) return 'SENSOR';
    if (normalized.includes('display')) return 'SPEAKER';
    if (normalized.includes('speaker')) return 'SPEAKER';
    if (normalized.includes('light')) return 'LIGHT';
    return 'UNKNOWN';
  }

  private isSdmOnline(traits: Record<string, unknown>): boolean {
    const connectivity = this.toObject(traits['sdm.devices.traits.Connectivity']);
    const status = this.toStringValue(connectivity.status);
    return status === 'ONLINE';
  }

  private toStatus(value: unknown): string {
    const status = this.toStringValue(value)?.toUpperCase();
    if (status === 'ONLINE' || status === 'OFFLINE' || status === 'CONNECTING') {
      return status;
    }
    return 'ONLINE';
  }

  private toActivity(value: unknown): string {
    const activity = this.toStringValue(value)?.toUpperCase();
    if (activity === 'ACTIVE' || activity === 'IDLE' || activity === 'BUSY' || activity === 'SLEEPING') {
      return activity;
    }
    return 'UNKNOWN';
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    return value;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }
}

export const googleHomeService = GoogleHomeService.getInstance();
