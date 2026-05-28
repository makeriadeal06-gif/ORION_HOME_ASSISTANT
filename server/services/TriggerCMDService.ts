import { Server } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';

export interface TriggerDevice {
  id: string;
  name: string;
  cmd: string;
  server: string;
  status: string;
  aliases?: string[];
  provider?: string;
  source?: string;
  app?: string;
  category?: string;
}

export interface UserBridgeConfig {
  token: string;
  endpoint?: string;
  syncedAt?: number;
  deviceCount?: number;
}

type TriggerSource = 'REAL' | 'FALLBACK' | 'CACHE';
type TriggerSourceMeta = TriggerSource | 'USER_REAL';

type TriggerFetchOutcome = {
  devices: TriggerDevice[];
  attempted: boolean;
  endpoint: string | null;
  status: number | null;
  tokenAccepted: boolean | null;
  reason: string;
};

const TRIGGER_REFRESH_INTERVAL_MS = 3 * 60 * 1000;

const TRIGGER_FALLBACK_DEVICES: TriggerDevice[] = [
  { id: '1', name: 'PC Sleep', cmd: 'powercfg /h off', server: 'OFFICE-DESKTOP', status: 'ONLINE' },
  { id: '2', name: 'Open Spotify', cmd: 'start spotify', server: 'OFFICE-DESKTOP', status: 'ONLINE' },
  { id: '3', name: 'Backup Server', cmd: 'bash backup.sh', server: 'LINUX-CORE', status: 'ONLINE' }
];

export class TriggerCMDService {
  private static instance: TriggerCMDService;
  private io: Server | null = null;
  private globalDevicesCache: TriggerDevice[] = [...TRIGGER_FALLBACK_DEVICES];
  private refreshInterval: NodeJS.Timeout | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private failureCount = 0;
  private lastDeviceSignature = '';
  private lastSource: TriggerSource = 'FALLBACK';
  private lastFetchStatusLog = '';
  private lastFallbackReason = '';

  // User-scoped storage
  private userConfigs = new Map<string, UserBridgeConfig>();
  private userDevicesCache = new Map<string, TriggerDevice[]>();
  private userRefreshTimers = new Map<string, NodeJS.Timeout>();
  private userLastSignatures = new Map<string, string>();

  // Parse tracking
  private lastParsePath = '';

  // Firestore integration (optional). If FIREBASE_SERVICE_ACCOUNT_JSON is set
  // in the environment, we'll attempt to initialize firebase-admin and persist
  // user configs to Firestore under collection `triggercmd_configs`.
  private firestoreInitDone = false;
  private firestoreEnabled = false;
  private firestoreDb: any = null;

  // File-based persistence for user configs (survives server restarts)
  private persistenceDir = '';
  private persistenceFilePath = '';
  private readonly defaultTriggerApiOrigin = 'https://www.triggercmd.com';

  private constructor() {
    this.persistenceDir = path.resolve(process.cwd(), 'data');
    this.persistenceFilePath = path.join(this.persistenceDir, 'triggercmd-configs.json');
  }

  private async tryInitFirestore() {
    if (this.firestoreInitDone) return;
    this.firestoreInitDone = true;

    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!keyJson) {
      // Not configured — keep using file-based persistence
      return;
    }

    try {
      // Dynamic import so code does not crash if firebase-admin is not installed
      const adminModule = await import('firebase-admin');
      const admin = (adminModule as any).default || adminModule;
      const serviceAccount = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
      if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.GCLOUD_PROJECT,
        });
      }
      this.firestoreDb = admin.firestore();
      this.firestoreEnabled = true;
      console.log('[TRIGGER_PERSIST] Firestore persistence enabled');
    } catch (err) {
      console.log('[TRIGGER_PERSIST] Failed to initialize Firestore:', err);
      this.firestoreEnabled = false;
      this.firestoreDb = null;
    }
  }

  public static getInstance(): TriggerCMDService {
    if (!TriggerCMDService.instance) {
      TriggerCMDService.instance = new TriggerCMDService();
    }
    return TriggerCMDService.instance;
  }

  public init(io: Server) {
    this.io = io;
    this.loadPersistedConfigs();

    const hasDevicesUrl = Boolean(process.env.TRIGGERCMD_DEVICES_URL);
    const hasExecuteUrl = Boolean(process.env.TRIGGERCMD_EXECUTE_URL);
    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || '';
    const hasToken = Boolean(tokenRaw);

    console.log(`[TRIGGER_CMD] Runtime sync active interval=${TRIGGER_REFRESH_INTERVAL_MS}ms`);
    console.log(`[TRIGGER_CMD_INIT] Env Check: hasDevicesUrl=${hasDevicesUrl}, hasExecuteUrl=${hasExecuteUrl}, hasToken=${hasToken}`);

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refreshDevices('interval').catch(() => {});
      }, TRIGGER_REFRESH_INTERVAL_MS);
    }

    this.refreshDevices('startup').catch(() => {});
  }

  // ──────────────── Persistence (survives server restart) ────────────────

  private async loadPersistedConfigs(): Promise<void> {
    try {
      // Try Firestore first if configured
      await this.tryInitFirestore();
      if (this.firestoreEnabled && this.firestoreDb) {
        try {
          const snapshot = await this.firestoreDb.collection('triggercmd_configs').get();
          snapshot.forEach((doc: any) => {
            const parsed = doc.data();
            if (parsed && parsed.token) {
              if (parsed.endpoint) parsed.endpoint = this.normalizeTriggerEndpoint(parsed.endpoint, 'list');
              this.userConfigs.set(doc.id, parsed as UserBridgeConfig);
              console.log(`[TRIGGER_PERSIST] restored config from firestore userId=${doc.id} token_length=${parsed.token?.length || 0}`);
            }
          });
          console.log(`[TRIGGER_PERSIST] restored ${this.userConfigs.size} user configs from firestore`);
          return;
        } catch (err) {
          console.log('[TRIGGER_PERSIST] failed to read from firestore, falling back to file:', err);
        }
      }

      if (!fs.existsSync(this.persistenceFilePath)) {
        console.log('[TRIGGER_PERSIST] no persisted configs found at', this.persistenceFilePath);
        return;
      }
      const raw = fs.readFileSync(this.persistenceFilePath, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return;
      for (const [userId, cfg] of Object.entries(data)) {
        const parsed = cfg as UserBridgeConfig;
        if (userId && parsed.token) {
          if (parsed.endpoint) {
            parsed.endpoint = this.normalizeTriggerEndpoint(parsed.endpoint, 'list');
          }
          this.userConfigs.set(userId, parsed);
          console.log(`[TRIGGER_PERSIST] restored config userId=${userId} token_length=${parsed.token.length}`);
        }
      }
      console.log(`[TRIGGER_PERSIST] restored ${this.userConfigs.size} user configs`);
    } catch (err) {
      console.log(`[TRIGGER_PERSIST] failed to load configs: ${err}`);
    }
  }

  private savePersistedConfigs(): void {
    // Run async: try Firestore first (if configured) otherwise fallback to file
    (async () => {
      try {
        await this.tryInitFirestore();
        if (this.firestoreEnabled && this.firestoreDb) {
          try {
            const batch = this.firestoreDb.batch();
            for (const [userId, cfg] of this.userConfigs.entries()) {
              const ref = this.firestoreDb.collection('triggercmd_configs').doc(userId);
              batch.set(ref, cfg);
            }
            await batch.commit();
            console.log('[TRIGGER_PERSIST] saved configs to firestore');
            return;
          } catch (err) {
            console.log('[TRIGGER_PERSIST] failed to save to firestore, will fallback to file:', err);
          }
        }
      } catch (err) {
        console.log('[TRIGGER_PERSIST] firestore init error, falling back to file:', err);
      }

      try {
        if (!fs.existsSync(this.persistenceDir)) {
          fs.mkdirSync(this.persistenceDir, { recursive: true });
        }
        const data: Record<string, UserBridgeConfig> = {};
        for (const [userId, cfg] of this.userConfigs.entries()) {
          data[userId] = cfg;
        }
        fs.writeFileSync(this.persistenceFilePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[TRIGGER_PERSIST] saved configs to disk');
      } catch (err) {
        console.log(`[TRIGGER_PERSIST] failed to save configs: ${err}`);
      }
    })();
  }

  // ──────────────── User-Scoped Config ────────────────

  public saveUserConfig(userId: string, config: Partial<UserBridgeConfig>): boolean {
    if (!userId) return false;

    const existing = this.userConfigs.get(userId) || { token: '' };
    const hadToken = existing.token.length > 0;
    const updated: UserBridgeConfig = {
      ...existing,
      ...config,
      endpoint: config.endpoint !== undefined
        ? this.normalizeTriggerEndpoint(config.endpoint, 'list')
        : existing.endpoint,
      syncedAt: config.syncedAt ?? existing.syncedAt ?? undefined,
      deviceCount: config.deviceCount ?? existing.deviceCount ?? undefined,
    };

    if (config.token !== undefined) {
      updated.token = config.token;
    }

    this.userConfigs.set(userId, updated);
    const masked = this.maskToken(updated.token);
    console.log(`[TRIGGER_CONFIG] saving token userId=${userId} current_state=${hadToken ? 'had_token' : 'no_token'} token=${masked}`);
    this.savePersistedConfigs();
    return true;
  }

  public getUserConfig(userId: string): {
    hasToken: boolean;
    endpoint?: string;
    syncedAt?: number;
    deviceCount?: number;
  } | null {
    if (!userId) return null;
    const config = this.userConfigs.get(userId);
    if (!config) {
      console.log(`[TRIGGER_CONFIG] loading config userId=${userId} found=false`);
      return null;
    }

    console.log(`[TRIGGER_CONFIG] loading config userId=${userId} found=true hasToken=${config.token.length > 0} token_length=${config.token.length}`);
    return {
      hasToken: config.token.length > 0,
      endpoint: config.endpoint,
      syncedAt: config.syncedAt,
      deviceCount: config.deviceCount,
      devices: this.userDevicesCache.get(userId) || []
    };
  }

  public getUserConfigRaw(userId: string): UserBridgeConfig | undefined {
    return this.userConfigs.get(userId);
  }

  public removeUserConfig(userId: string): void {
    if (!userId) return;
    this.cleanupUserSession(userId);
    this.userConfigs.delete(userId);
    this.savePersistedConfigs();
    console.log(`[TRIGGER_CONFIG] full config deleted userId=${userId}`);
  }

  public cleanupUserSession(userId: string): void {
    if (!userId) return;
    this.stopUserAutoRefresh(userId);
    this.userDevicesCache.delete(userId);
    this.userLastSignatures.delete(userId);
    console.log(`[TRIGGER_CONFIG] session cache cleared userId=${userId} (config preserved)`);
  }

  // ──────────────── User-Scoped Sync ────────────────

  public async syncUserDevices(userId: string): Promise<{
    success: boolean;
    count: number;
    status: string;
  }> {
    console.log(`[TRIGGER_SYNC] enter_sync userId=${userId}`);
    const config = this.getUserConfigRaw(userId);
    console.log(`[TRIGGER_SYNC] config_found=${!!config} has_token=${config?.token ? config.token.length + ' chars' : 'no'}`);
    if (!config || !config.token) {
      console.log(`[TRIGGER_SYNC] user=${userId} no token configured`);
      return { success: false, count: 0, status: 'no_token' };
    }

    const existingCache = this.userDevicesCache.get(userId);
    console.log(`[TRIGGER_SYNC] existing_cache=${existingCache?.length || 0} items for userId=${userId}`);

    const endpoint = config.endpoint || process.env.TRIGGERCMD_DEVICES_URL || '';

    if (endpoint === process.env.TRIGGERCMD_DEVICES_URL || '') {
      console.log(`[TRIGGER_SYNC] endpoint_source=env_var value="${endpoint ? endpoint.substring(0, 80) + '...' : '(empty)'}"`);
    } else {
      console.log(`[TRIGGER_SYNC] endpoint_source=user_config value="${endpoint ? endpoint.substring(0, 80) + '...' : '(empty)'}"`);
    }

    if (!endpoint) {
      console.log(`[TRIGGER_SYNC] user=${userId} no endpoint configured — both user config and env var are empty`);
      return { success: false, count: 0, status: 'no_endpoint' };
    }

    console.log(`[TRIGGER_SYNC] syncing user triggers userId=${userId}`);

    const outcome = await this.fetchRemoteDevicesForUser(endpoint, config.token);

    console.log(`[TRIGGER_SYNC] endpoint response received status=${outcome.status} tokenAccepted=${outcome.tokenAccepted} reason=${outcome.reason} devices=${outcome.devices.length}`);
    console.log(`[TRIGGER_SYNC] payload parsed format=direct devices=${outcome.devices.length} attempted=${outcome.attempted}`);

    if (outcome.devices.length > 0) {
      this.userDevicesCache.set(userId, outcome.devices);
      console.log(`[TRIGGER_CACHE] storing devices=${outcome.devices.length} userId=${userId}`);

      const signature = JSON.stringify(
        outcome.devices.map((d) => `${d.id}:${d.name}:${d.cmd}:${d.status}:${d.server}`).sort()
      );
      this.userLastSignatures.set(userId, signature);

      config.deviceCount = outcome.devices.length;
      config.syncedAt = Date.now();
      this.userConfigs.set(userId, config);

      console.log(`[TRIGGER_SYNC] devices normalized=${outcome.devices.length} userId=${userId}`);

      // Emit to the user's room
      if (this.io) {
        this.io.to(`user:${userId}`).emit('trigger:devices', outcome.devices);
        console.log(`[TRIGGER_HYDRATION] emitted count=${outcome.devices.length} room=user:${userId}`);
      }

      return { success: true, count: outcome.devices.length, status: 'synced', devices: outcome.devices };
    }

    // Fallback: keep existing cache if any
    const existing = this.userDevicesCache.get(userId);
    if (existing && existing.length > 0) {
      return { success: true, count: existing.length, status: 'cache', devices: existing };
    }

    return { success: false, count: 0, status: outcome.reason === 'token_rejected' ? 'invalid_token' : outcome.reason, devices: [] };
  }

  public getDevicesForUser(userId: string): TriggerDevice[] {
    if (!userId) return [];
    return this.userDevicesCache.get(userId) || [];
  }

  public executeForUser(userId: string, deviceId: string): boolean {
    if (!userId || !deviceId) return false;

    const devices = this.userDevicesCache.get(userId) || [];
    const device = devices.find(d => d.id === deviceId);
    if (!device) return false;

    const config = this.getUserConfigRaw(userId);
    const token = config?.token || '';
    const endpoint = this.resolveExecuteEndpoint(config?.endpoint || process.env.TRIGGERCMD_EXECUTE_URL || '');

    if (!token || !endpoint) {
      console.warn(`[TRIGGER_RUNTIME] Execute skipped for user=${userId}: missing token or endpoint`);
      return false;
    }

    console.log(`[TRIGGER_RUNTIME] isolated runtime ready — executing ${device.name} for user=${userId}`);

    this.executeRemoteWithToken(endpoint, token, device).catch((error) => {
      const message = error instanceof Error ? error.message : 'unknown_error';
      console.warn(`[TRIGGER_RUNTIME] Remote execute failed for user=${userId} (${message})`);
    });

    return true;
  }

  public startUserAutoRefresh(userId: string): void {
    if (this.userRefreshTimers.has(userId)) return;

    const timer = setInterval(() => {
      this.syncUserDevices(userId).catch(() => {});
    }, TRIGGER_REFRESH_INTERVAL_MS);

    this.userRefreshTimers.set(userId, timer);
    console.log(`[TRIGGER_RUNTIME] isolated runtime ready userId=${userId}`);
  }

  public stopUserAutoRefresh(userId: string): void {
    const timer = this.userRefreshTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.userRefreshTimers.delete(userId);
    }
  }

  public userHasConfig(userId: string): boolean {
    return this.userConfigs.has(userId) && Boolean(this.userConfigs.get(userId)?.token);
  }

  // ──────────────── Token Masking ────────────────

  public maskToken(token: string): string {
    if (!token || token.length < 8) return token ? token.substring(0, 4) + '****' : '';
    return token.substring(0, 4) + '****' + token.substring(token.length - 4);
  }

  // ──────────────── Legacy Methods (Global) ────────────────

  public getDevices() {
    return this.globalDevicesCache;
  }

  public execute(deviceId: string) {
    if (!deviceId) return false;

    const device = this.globalDevicesCache.find(d => d.id === deviceId);
    if (device) {
      console.log(`[TRIGGER_CMD] Executing ${device.name} on ${device.server}`);

      this.executeRemote(device).catch((error) => {
        const message = error instanceof Error ? error.message : 'unknown_error';
        console.warn(`[TRIGGER_CMD] Remote execute failed (${message})`);
      });

      return true;
    }
    return false;
  }

  // ──────────────── Internal: Refresh (Legacy) ────────────────

  private async refreshDevices(reason: string) {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }

    this.refreshInFlight = this.performRefresh(reason)
      .catch(() => {})
      .finally(() => {
        this.refreshInFlight = null;
      });

    await this.refreshInFlight;
  }

  private async performRefresh(reason: string) {
    const remote = await this.fetchRemoteDevices();

    if (remote.attempted) {
      this.logFetchStatus(remote);
    }

    if (remote.devices.length > 0) {
      this.failureCount = 0;
      this.updateCache(remote.devices, reason, 'REAL');
      return;
    }

    this.failureCount++;
    const fallbackSource: TriggerSource = this.globalDevicesCache.length > 0 ? 'CACHE' : 'FALLBACK';
    const fallbackDevices = this.globalDevicesCache.length > 0 ? this.globalDevicesCache : this.resolveFallbackDevices();
    this.logFallbackReason(remote.reason, remote);
    this.updateCache(fallbackDevices, reason, fallbackSource);
  }

  private updateCache(devices: TriggerDevice[], reason: string, source: TriggerSource) {
    if (!Array.isArray(devices)) return;

    const normalized = devices.filter((device) => {
      return Boolean(device && device.id && device.name && device.cmd && device.server && device.status);
    });

    if (normalized.length === 0) return;

    const signature = JSON.stringify(
      normalized.map((d) => `${d.id}:${d.name}:${d.cmd}:${d.status}:${d.server}`).sort()
    );
    const changed = signature !== this.lastDeviceSignature || source !== this.lastSource;

    this.globalDevicesCache = normalized;

    if (changed) {
      this.lastDeviceSignature = signature;
      this.io?.emit('trigger:devices', normalized);
      console.log(`[TRIGGER_CMD] Device sync source=${source} count=${normalized.length} reason=${reason}`);
    }

    console.log(`[TRIGGER_CMD_REGISTRY] Current registry status: activeDevicesCount=${this.globalDevicesCache.length} source=${source} devices=[${this.globalDevicesCache.map(d => `${d.name} (${d.status})`).join(', ')}]`);

    this.lastSource = source;
  }

  private resolveFallbackDevices(): TriggerDevice[] {
    if (this.globalDevicesCache.length > 0) {
      return this.globalDevicesCache;
    }
    return [...TRIGGER_FALLBACK_DEVICES];
  }

  // ──────────────── Internal: Fetch (User-Scoped) ────────────────

  private async fetchRemoteDevicesForUser(endpoint: string, token: string): Promise<TriggerFetchOutcome> {
    console.log(`[TRIGGER_FETCH] enter_fetch endpoint_raw="${endpoint}" token_length=${token?.length || 0}`);
    const candidateUrls = this.resolveDeviceFetchCandidates(endpoint);
    if (candidateUrls.length === 0) {
      console.log(`[TRIGGER_FETCH] endpoint=null reason=missing_devices_endpoint`);
      return {
        devices: [],
        attempted: false,
        endpoint: null,
        status: null,
        tokenAccepted: null,
        reason: 'missing_devices_endpoint'
      };
    }

    const sanitizedToken = this.sanitizeToken(token);
    if (!sanitizedToken) {
      console.log(`[TRIGGER_FETCH] endpoint=${candidateUrls[0]} reason=missing_token`);
      return {
        devices: [],
        attempted: true,
        endpoint: candidateUrls[0],
        status: null,
        tokenAccepted: null,
        reason: 'missing_token'
      };
    }

    let lastOutcome: TriggerFetchOutcome | null = null;
    for (const candidateUrl of candidateUrls) {
      const outcome = await this.fetchRemoteDevicesFromUrl(candidateUrl, sanitizedToken);
      lastOutcome = outcome;

      if (outcome.devices.length > 0) {
        return outcome;
      }

      if (outcome.reason === 'token_rejected' || outcome.reason.startsWith('api_error:')) {
        return outcome;
      }
    }

    return lastOutcome || {
      devices: [],
      attempted: false,
      endpoint: null,
      status: null,
      tokenAccepted: null,
      reason: 'missing_devices_endpoint'
    };
  }

  private async fetchRemoteDevicesFromUrl(sanitizedUrl: string, sanitizedToken: string): Promise<TriggerFetchOutcome> {
    console.log(`[TRIGGER_FETCH] trying_endpoint=${sanitizedUrl}`);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${sanitizedToken}`
    };

    const method = this.resolveHttpMethod(process.env.TRIGGERCMD_DEVICES_METHOD || 'GET');
    console.log(`[TRIGGER_HTTP] url=${sanitizedUrl} method=${method} authorization_present=true token_length=${sanitizedToken.length}`);
    console.log(`[TRIGGER_HTTP] headers=${JSON.stringify({ Authorization: `Bearer ${this.maskToken(sanitizedToken)}`, ...headers })}`);

    let response: Response | null = null;
    try {
      response = await fetch(sanitizedUrl, { method, headers });
    } catch (fetchError) {
      const errMsg = fetchError instanceof Error ? fetchError.message : 'Unknown network error';
      console.log(`[TRIGGER_FETCH] network_error=${errMsg}`);
      return {
        devices: [],
        attempted: true,
        endpoint: sanitizedUrl,
        status: null,
        tokenAccepted: null,
        reason: `fetch_exception: ${errMsg}`
      };
    }

    const status = response.status;
    const contentType = response.headers.get('content-type') || '(none)';
    const tokenAccepted = status !== 401;
    console.log(`[TRIGGER_HTTP] url=${sanitizedUrl} method=${method} status=${status} contentType=${contentType}`);
    console.log(`[TRIGGER_HTTP] status=${status} tokenAccepted=${tokenAccepted}`);

    if (!response.ok) {
      // Read error body for diagnostics
      let errorBody = '';
      try { errorBody = await response.text().then(t => t.substring(0, 500)); } catch {}
      console.log(`[TRIGGER_HTTP] error_body_preview=${errorBody}`);
      console.log(`[TRIGGER_CMD_FETCH] API responded with error status: ${status}. tokenAccepted=${tokenAccepted}`);
      return {
        devices: [],
        attempted: true,
        endpoint: sanitizedUrl,
        status,
        tokenAccepted,
        reason: status === 401 ? 'token_rejected' : `http_${status}`
      };
    }

    // Log raw text BEFORE JSON parsing to detect HTML/non-JSON responses
    const rawText = await response.text();
    console.log(`[TRIGGER_HTTP] raw_response_preview=${rawText.substring(0, 500)}`);

    // Detect content type issues
    const isJson = contentType.includes('json') || contentType.includes('javascript');
    const isHtml = contentType.includes('html');
    if (isHtml) {
      console.log(`[TRIGGER_PARSE] html_response_detected=true contentType=${contentType}`);
    }
    if (!isJson && !isHtml) {
      console.log(`[TRIGGER_PARSE] unknown_content_type=${contentType}`);
    }

    // Parse JSON
    let payload: unknown = null;
    try {
      payload = JSON.parse(rawText);
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.log(`[TRIGGER_PARSE] json_parse_error=${msg}`);
      if (isHtml) {
        console.log(`[TRIGGER_PARSE] invalid_content_type=html`);
      } else {
        console.log(`[TRIGGER_PARSE] invalid_content_type=${contentType}`);
      }
      return {
        devices: [],
        attempted: true,
        endpoint: sanitizedUrl,
        status,
        tokenAccepted,
        reason: 'invalid_content_type'
      };
    }

    // Check for TriggerCMD API-level error field (e.g. { "err": "Invalid Token!" } with HTTP 200)
    const payloadObj = this.toObject(payload);
    const errField = this.toStringValue(payloadObj.err);
    if (errField) {
      console.log(`[TRIGGER_PARSE] api_error_detected=true err="${errField}"`);
      return {
        devices: [],
        attempted: true,
        endpoint: sanitizedUrl,
        status,
        tokenAccepted: false,
        reason: `api_error: ${errField}`
      };
    }

    const list = payload ? this.extractCommandList(payload) : [];
    console.log(`[TRIGGER_PARSE] parser_selected=${this.lastParsePath} list_length=${list.length}`);
    if (payload) {
      const payloadType = Array.isArray(payload) ? 'array' : 'object';
      const sampleKeys = Object.keys(payload as Record<string, unknown>);
      console.log(`[TRIGGER_PARSE] payload_received=true payload_type=${payloadType} root_keys=${JSON.stringify(sampleKeys)}`);
      if (list.length > 0) {
        const first = list[0] as Record<string, unknown>;
        console.log(`[TRIGGER_NORMALIZE] first_item_keys=${JSON.stringify(Object.keys(first || {}))}`);
      } else if (Array.isArray(payload)) {
        console.log(`[TRIGGER_PARSE] direct_array_but_empty=true`);
      }
    } else {
      console.log(`[TRIGGER_PARSE] payload_received=false`);
    }

    console.log(`[TRIGGER_FETCH] Total received from account: ${list.length}`);

    let discardedCount = 0;
    const devices: TriggerDevice[] = [];
    for (const raw of list) {
      const dev = this.normalizeDevice(raw);
      if (dev) {
        devices.push(dev);
        console.log(`[TRIGGER_NORMALIZE] accepted=true id=${dev.id} name=${dev.name} server=${dev.server}`);
      } else {
        discardedCount++;
        console.log(`[TRIGGER_NORMALIZE] accepted=false raw=${JSON.stringify(raw).substring(0, 300)}`);
      }
    }

    console.log(`[TRIGGER_FETCH] Successfully normalized: ${devices.length}, Discarded: ${discardedCount}`);

    return {
      devices,
      attempted: true,
      endpoint: sanitizedUrl,
      status,
      tokenAccepted,
      reason: devices.length > 0 ? 'remote_ok' : 'payload_not_mapped'
    };
  }

  // ──────────────── Internal: Fetch (Legacy) ────────────────

  private async fetchRemoteDevices(): Promise<TriggerFetchOutcome> {
    const endpoint = this.sanitizeUrl(process.env.TRIGGERCMD_DEVICES_URL || '');
    if (!endpoint) {
      return {
        devices: [],
        attempted: false,
        endpoint: null,
        status: null,
        tokenAccepted: null,
        reason: 'missing_devices_endpoint'
      };
    }

    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || '';
    const token = this.sanitizeToken(tokenRaw);

    if (!token) {
      return {
        devices: [],
        attempted: true,
        endpoint,
        status: null,
        tokenAccepted: null,
        reason: 'missing_token'
      };
    }

    return this.fetchRemoteDevicesForUser(endpoint, token);
  }

  // ──────────────── Internal: Execute ────────────────

  private async executeRemoteWithToken(endpoint: string, token: string, device: TriggerDevice) {
    const sanitizedEndpoint = this.sanitizeUrl(endpoint);
    if (!sanitizedEndpoint) return;

    const sanitizedToken = this.sanitizeToken(token);
    if (!sanitizedToken) {
      console.warn('[TRIGGER_RUNTIME] Execute skipped: missing token');
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sanitizedToken}`
    };

    const payload = {
      id: device.id,
      deviceId: device.id,
      command: device.cmd,
      server: device.server,
      name: device.name,
      computer: device.server,
      trigger: device.cmd,
      params: ''
    };

    const response = await fetch(sanitizedEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      if (response.status === 401) {
        console.warn('[TRIGGER_RUNTIME] Execute token rejected (401)');
      }
      throw new Error(`trigger_execute_${response.status}`);
    }
  }

  private async executeRemote(device: TriggerDevice) {
    const endpoint = this.sanitizeUrl(process.env.TRIGGERCMD_EXECUTE_URL || '');
    if (!endpoint) return;

    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || '';
    const token = this.sanitizeToken(tokenRaw);
    if (!token) {
      console.warn('[TRIGGER_RUNTIME] Execute skipped: missing token');
      return;
    }

    return this.executeRemoteWithToken(endpoint, token, device);
  }

  // ──────────────── Payload Parsing ────────────────

  private extractCommandList(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      this.lastParsePath = 'direct_array';
      console.log(`[TRIGGER_PARSE] parser_selected=direct_array count=${payload.length}`);
      return payload;
    }

    const root = this.toObject(payload);
    const rootKeys = Object.keys(root);
    console.log(`[TRIGGER_PARSE] payload_type=object root_keys=${JSON.stringify(rootKeys)}`);

    // Direct check for common TriggerCMD response keys
    if (Array.isArray(root.records)) {
      this.lastParsePath = 'root.records';
      return root.records;
    }
    if (Array.isArray(root.devices)) {
      this.lastParsePath = 'root.devices';
      return root.devices;
    }
    if (Array.isArray(root.commands)) {
      this.lastParsePath = 'root.commands';
      return root.commands;
    }
    if (Array.isArray(root.triggers)) {
      this.lastParsePath = 'root.triggers';
      return root.triggers;
    }

    // Sometimes the response is a list of computers, each with its own commands
    if (Array.isArray(root.computers)) {
      this.lastParsePath = 'root.computers_flatten';
      console.log(`[TRIGGER_PARSE] flattening computers count=${root.computers.length}`);
      const allCommands: unknown[] = [];
      for (const comp of root.computers) {
        const compObj = this.toObject(comp);
        if (Array.isArray(compObj.commands)) {
          // Inject computer info into commands if missing
          allCommands.push(...compObj.commands.map(cmd => ({
            ...this.toObject(cmd),
            server: compObj.name || compObj.computerName || compObj.voice
          })));
        }
      }
      return allCommands;
    }

    const data = this.toObject(root.data);
    const dataKeys = Object.keys(data);
    console.log(`[TRIGGER_PARSE] trying root.data keys=${JSON.stringify(dataKeys)}`);
    
    if (Array.isArray(data.records)) {
      this.lastParsePath = 'root.data.records';
      return data.records;
    }

    // Check for other common array keys inside data
    for (const key of ['devices', 'commands', 'triggers', 'computers', 'items', 'list', 'result', 'results', 'data']) {
      if (Array.isArray(data[key])) {
        if (key === 'computers') {
           const allCommands: unknown[] = [];
           for (const comp of data[key]) {
             const compObj = this.toObject(comp);
             if (Array.isArray(compObj.commands)) {
               allCommands.push(...compObj.commands.map(cmd => ({
                 ...this.toObject(cmd),
                 server: compObj.name || compObj.computerName || compObj.voice
               })));
             }
           }
           this.lastParsePath = `root.data.computers_flatten`;
           return allCommands;
        }
        this.lastParsePath = `root.data.${key}`;
        return data[key];
      }
    }

    // Check root for other common array keys
    for (const key of ['items', 'list', 'result', 'results', 'data']) {
      if (Array.isArray(root[key])) {
        this.lastParsePath = `root.${key}`;
        return root[key];
      }
    }

    this.lastParsePath = 'none';
    console.log(`[TRIGGER_PARSE] parser_selected=none — no array found in payload. keys=${JSON.stringify(rootKeys)}`);
    return [];
  }

  private normalizeDevice(raw: unknown): TriggerDevice | null {
    if (!raw || typeof raw !== 'object') {
      console.log(`[TRIGGER_NORMALIZE] accepted=false reason=not_object raw_type=${typeof raw}`);
      return null;
    }

    const device = raw as Record<string, unknown>;
    const rawKeys = Object.keys(device);
    const computer = this.toObject(device.computer);
    const trigger = this.toStringValue(device.trigger);
    const commandText = this.toStringValue(device.command) || this.toStringValue(device.cmd);
    const name = this.toStringValue(device.name) || trigger || commandText;
    const aliases = this.toStringArray(device.aliases || device.alias || device.altNames || []);
    const category = this.toStringValue(device.category) || this.toStringValue(device.type) || this.toStringValue(device.group) || this.inferCategory(name || commandText || '');
    const app = this.toStringValue(device.app) || this.toStringValue(device.application) || this.toStringValue(device.process) || this.toStringValue(device.executable) || this.extractLabel(commandText || name || '');

    const cmd = trigger || this.toStringValue(device.cmd) || commandText || name;
    const server =
      this.toStringValue(device.server) ||
      this.toStringValue(device.computer) ||
      this.toStringValue(device.computerName) ||
      this.toStringValue(device.voice) ||
      this.toStringValue(computer.name) ||
      this.toStringValue(computer.computerName) ||
      this.toStringValue(computer.voice) ||
      'TRIGGERCMD_NODE';

    const id =
      this.toStringValue(device.id) ||
      this.toStringValue(device.deviceId) ||
      this.toStringValue(device._id) ||
      `${server}:${cmd}`;

    let status = 'ONLINE';
    if (device.status !== undefined) {
      status = this.toStringValue(device.status) || 'ONLINE';
    } else if (computer && typeof computer.connected === 'boolean') {
      status = computer.connected ? 'ONLINE' : 'OFFLINE';
    }

    if (!id || !name || !cmd) {
      const discardReason = !id ? 'missing_id' : (!name ? 'missing_name' : 'missing_cmd');
      console.log(`[TRIGGER_NORMALIZE] accepted=false reason=${discardReason} raw_keys=${JSON.stringify(rawKeys)} id=${id} name=${name} cmd=${cmd}`);
      return null;
    }

    console.log(`[TRIGGER_NORMALIZE] accepted=true id=${id} name=${name} server=${server} status=${status}`);
    return { id, name, cmd, server, status: status.toUpperCase(), aliases, provider: 'TriggerCMD', source: server, app, category };
  }

  // ──────────────── Helpers ────────────────

  private sanitizeToken(value: string): string {
    let token = (value || '').trim();
    if (!token) return '';

    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith('\'') && token.endsWith('\''))) {
      token = token.slice(1, -1).trim();
    }

    token = token.replace(/^Bearer\s+/i, '').trim();
    return token;
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => this.toStringValue(entry)).filter((entry): entry is string => Boolean(entry));
  }

  private inferCategory(value: string): string {
    const lowered = value.toLowerCase();
    if (lowered.includes('spotify') || lowered.includes('discord') || lowered.includes('steam')) return 'app';
    if (lowered.includes('bluetooth') || lowered.includes('headset') || lowered.includes('device')) return 'device';
    return 'automation';
  }

  private extractLabel(value: string): string {
    const normalized = value.split(/[\\/]/).filter(Boolean).pop() || value;
    return normalized.replace(/\.[^.]+$/, '');
  }

  private sanitizeUrl(value: string): string {
    let url = (value || '').trim();
    if (!url) return '';

    if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith('\'') && url.endsWith('\''))) {
      url = url.slice(1, -1).trim();
    }

    return url;
  }

  private resolveDeviceFetchCandidates(endpoint: string): string[] {
    const sanitized = this.sanitizeUrl(endpoint);
    if (!sanitized) return [];

    const normalized = this.normalizeTriggerEndpoint(sanitized, 'list');
    return [...new Set([normalized, sanitized].filter(Boolean))];
  }

  private resolveExecuteEndpoint(endpoint: string): string {
    const sanitized = this.sanitizeUrl(endpoint);
    if (!sanitized) {
      return `${this.defaultTriggerApiOrigin}/api/run/trigger`;
    }

    return this.normalizeTriggerEndpoint(sanitized, 'execute');
  }

  private normalizeTriggerEndpoint(value: string, mode: 'list' | 'execute'): string {
    const sanitized = this.sanitizeUrl(value);
    if (!sanitized) return '';

    try {
      const url = new URL(sanitized);
      const isTriggerCmdHost = /(^|\.)triggercmd\.com$/i.test(url.hostname);
      if (!isTriggerCmdHost) {
        return sanitized;
      }

      if (mode === 'list') {
        if (url.pathname === '/user/command/list' || url.pathname === '/api/command/list') {
          url.pathname = '/api/command/list';
        } else if (url.pathname === '/user/computer/list' || url.pathname === '/api/computer/list') {
          url.pathname = '/api/computer/list';
        }
      }

      if (mode === 'execute') {
        if (
          url.pathname === '/user/command/list' ||
          url.pathname === '/api/command/list' ||
          url.pathname === '/user/computer/list' ||
          url.pathname === '/api/computer/list' ||
          url.pathname === '/user/run/trigger'
        ) {
          url.pathname = '/api/run/trigger';
          url.search = '';
        }
      }

      return url.toString();
    } catch {
      return sanitized;
    }
  }

  private resolveHttpMethod(value: string): 'GET' | 'POST' {
    const method = (value || 'GET').trim().toUpperCase();
    return method === 'POST' ? 'POST' : 'GET';
  }

  private logFetchStatus(outcome: TriggerFetchOutcome) {
    const tokenStatus = outcome.tokenAccepted === true
      ? 'accepted'
      : outcome.tokenAccepted === false
        ? 'rejected'
        : 'unavailable';

    const status = outcome.status === null ? 'n/a' : `${outcome.status}`;
    const key = `${outcome.endpoint}|${status}|${tokenStatus}|${outcome.reason}`;
    if (key === this.lastFetchStatusLog) return;

    this.lastFetchStatusLog = key;
    console.log(`[TRIGGER_CMD] Fetch status=${status} token=${tokenStatus} endpoint=${outcome.endpoint} reason=${outcome.reason}`);
  }

  private logFallbackReason(reason: string, outcome: TriggerFetchOutcome) {
    const status = outcome.status === null ? 'n/a' : `${outcome.status}`;
    const key = `${reason}|${status}|${outcome.endpoint}`;
    if (key === this.lastFallbackReason) return;

    this.lastFallbackReason = key;
    console.log(`[TRIGGER_CMD] Fallback reason=${reason} status=${status} endpoint=${outcome.endpoint}`);
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) return null;
    return value.trim();
  }
}

export const triggerCmdService = TriggerCMDService.getInstance();
