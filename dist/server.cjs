"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server/server.ts
var server_exports = {};
__export(server_exports, {
  app: () => app,
  default: () => server_default,
  httpServer: () => httpServer,
  io: () => io
});
module.exports = __toCommonJS(server_exports);
var import_express = __toESM(require("express"), 1);
var import_http = require("http");
var import_socket = require("socket.io");
var import_cors = __toESM(require("cors"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");

// server/mqtt/MqttManager.ts
var import_mqtt = __toESM(require("mqtt"), 1);
var BackendMqttManager = class _BackendMqttManager {
  static instance;
  client = null;
  io = null;
  connected = false;
  subscriptionsHealthy = false;
  subscriptionCount = 0;
  lastPacketAt = 0;
  lastHeartbeatAt = 0;
  telemetryInterval = null;
  subscribedTopics = ["orion/telemetry/#", "orion/status/#", "orion/commands/#"];
  constructor() {
  }
  static getInstance() {
    if (!_BackendMqttManager.instance) {
      _BackendMqttManager.instance = new _BackendMqttManager();
    }
    return _BackendMqttManager.instance;
  }
  init(io2) {
    this.io = io2;
<<<<<<< HEAD
    this.connect();
  }
  forceReconnect() {
    console.log("[BACKEND_MQTT] Force reconnect requested");
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    this.connected = false;
    this.subscriptionsHealthy = false;
    this.broadcastStatus();
=======
>>>>>>> 1aa288f (fix: vercel backend runtime fase 01.2)
    this.connect();
  }
  connect() {
    const brokerUrl = process.env.MQTT_URL || "wss://broker.emqx.io:8084/mqtt";
    console.log(`[BACKEND_MQTT] Connecting to ${brokerUrl}...`);
    try {
      this.client = import_mqtt.default.connect(brokerUrl, {
        clientId: `orion_backend_${Math.random().toString(16).slice(2, 8)}`,
        clean: true,
        connectTimeout: 15e3,
        keepalive: 60,
        reconnectPeriod: 5e3,
        protocolVersion: 5,
        rejectUnauthorized: false,
        path: "/mqtt",
        manualConnect: false
      });
      this.client.on("connect", () => {
        console.log("[BACKEND_MQTT] Connected to broker");
        this.connected = true;
        this.subscribeTopics();
        this.startTelemetryHeartbeat();
        this.emitTelemetry("heartbeat");
        this.broadcastStatus();
      });
      this.client.on("message", (topic, payload) => {
        this.lastPacketAt = Date.now();
        if (topic.includes("status") || topic.includes("telemetry")) {
          console.log(`[BACKEND_MQTT] Ingress: ${topic}`);
        }
        this.io?.emit("mqtt:message", { topic, payload: payload.toString() });
        this.emitTelemetry("packet_flow", { topic });
      });
      this.client.on("close", () => {
        if (this.connected) {
          console.log("[BACKEND_MQTT] Connection closed");
          this.connected = false;
          this.subscriptionsHealthy = false;
          this.subscriptionCount = 0;
          this.stopTelemetryHeartbeat();
          this.broadcastStatus();
        }
      });
      this.client.on("reconnect", () => {
        console.log("[BACKEND_MQTT] Attempting to reconnect...");
        this.broadcastStatus();
      });
      this.client.on("error", (err) => {
        console.error(`[BACKEND_MQTT] Error: ${err.message}`);
        this.broadcastStatus();
      });
    } catch (error) {
      console.error("[BACKEND_MQTT] Initialization failed:", error);
    }
  }
  subscribeTopics() {
    console.log(`[BACKEND_MQTT] Subscribing to topics: ${this.subscribedTopics.join(", ")}`);
    this.client?.subscribe(this.subscribedTopics, (error, granted) => {
      if (error) {
        console.error(`[BACKEND_MQTT] Subscribe failed: ${error.message}`);
        this.subscriptionsHealthy = false;
        this.subscriptionCount = 0;
        this.broadcastStatus();
        return;
      }
      this.subscriptionsHealthy = Array.isArray(granted) && granted.length > 0;
      this.subscriptionCount = granted?.length || 0;
      console.log(`[BACKEND_MQTT] Subscriptions active. Count: ${this.subscriptionCount}`);
      this.broadcastStatus();
      this.emitTelemetry("subscriptions_restored");
    });
  }
  startTelemetryHeartbeat() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
    }
    this.telemetryInterval = setInterval(() => {
      if (!this.connected) {
        return;
      }
      this.emitTelemetry("heartbeat");
    }, 15e3);
    console.log("[BACKEND_MQTT] Telemetry heartbeat started (15s interval)");
  }
  stopTelemetryHeartbeat() {
    if (!this.telemetryInterval) {
      return;
    }
    clearInterval(this.telemetryInterval);
    this.telemetryInterval = null;
  }
  emitTelemetry(type, extra) {
    this.lastHeartbeatAt = Date.now();
    this.io?.emit("mqtt:telemetry", {
      type,
      connected: this.connected,
      subscriptionsHealthy: this.subscriptionsHealthy,
      subscriptionCount: this.subscriptionCount,
      lastPacketAt: this.lastPacketAt,
      heartbeatAt: this.lastHeartbeatAt,
      meshState: this.resolveMeshState(),
      ...extra
    });
  }
  resolveMeshState() {
    return this.connected && this.subscriptionsHealthy ? "ACTIVE" : "DEGRADED";
  }
  broadcastStatus() {
    this.io?.emit("mqtt:status", {
      connected: this.connected,
      timestamp: Date.now(),
      subscriptionsHealthy: this.subscriptionsHealthy,
      subscriptionCount: this.subscriptionCount,
      lastPacketAt: this.lastPacketAt,
      heartbeatAt: this.lastHeartbeatAt,
      meshState: this.resolveMeshState()
    });
  }
  publish(topic, message) {
    if (this.connected && this.client) {
      this.client.publish(topic, message);
    }
  }
};
var backendMqttManager = BackendMqttManager.getInstance();

// server/services/TriggerCMDService.ts
var fs = __toESM(require("fs"), 1);
var path = __toESM(require("path"), 1);
var TRIGGER_REFRESH_INTERVAL_MS = 3 * 60 * 1e3;
var TRIGGER_FALLBACK_DEVICES = [
  { id: "1", name: "PC Sleep", cmd: "powercfg /h off", server: "OFFICE-DESKTOP", status: "ONLINE" },
  { id: "2", name: "Open Spotify", cmd: "start spotify", server: "OFFICE-DESKTOP", status: "ONLINE" },
  { id: "3", name: "Backup Server", cmd: "bash backup.sh", server: "LINUX-CORE", status: "ONLINE" }
];
var TriggerCMDService = class _TriggerCMDService {
  static instance;
  io = null;
  globalDevicesCache = [...TRIGGER_FALLBACK_DEVICES];
  refreshInterval = null;
  refreshInFlight = null;
  failureCount = 0;
  lastDeviceSignature = "";
  lastSource = "FALLBACK";
  lastFetchStatusLog = "";
  lastFallbackReason = "";
  // User-scoped storage
  userConfigs = /* @__PURE__ */ new Map();
  userDevicesCache = /* @__PURE__ */ new Map();
  userRefreshTimers = /* @__PURE__ */ new Map();
  userLastSignatures = /* @__PURE__ */ new Map();
  // Parse tracking
  lastParsePath = "";
  // Firestore integration (optional). If FIREBASE_SERVICE_ACCOUNT_JSON is set
  // in the environment, we'll attempt to initialize firebase-admin and persist
  // user configs to Firestore under collection `triggercmd_configs`.
  firestoreInitDone = false;
  firestoreEnabled = false;
  firestoreDb = null;
  // File-based persistence for user configs (survives server restarts)
  persistenceDir = "";
  persistenceFilePath = "";
  defaultTriggerApiOrigin = "https://www.triggercmd.com";
  constructor() {
    this.persistenceDir = path.resolve(process.cwd(), "data");
    this.persistenceFilePath = path.join(this.persistenceDir, "triggercmd-configs.json");
  }
  async tryInitFirestore() {
    if (this.firestoreInitDone) return;
    this.firestoreInitDone = true;
    const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!keyJson) {
      return;
    }
    try {
      const adminModule = await import("firebase-admin");
      const admin = adminModule.default || adminModule;
      const serviceAccount = typeof keyJson === "string" ? JSON.parse(keyJson) : keyJson;
      if (!admin.apps || admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.GCLOUD_PROJECT
        });
      }
      this.firestoreDb = admin.firestore();
      this.firestoreEnabled = true;
      console.log("[TRIGGER_PERSIST] Firestore persistence enabled");
    } catch (err) {
      console.log("[TRIGGER_PERSIST] Failed to initialize Firestore:", err);
      this.firestoreEnabled = false;
      this.firestoreDb = null;
    }
  }
  static getInstance() {
    if (!_TriggerCMDService.instance) {
      _TriggerCMDService.instance = new _TriggerCMDService();
    }
    return _TriggerCMDService.instance;
  }
  init(io2) {
    this.io = io2;
    this.loadPersistedConfigs();
    const hasDevicesUrl = Boolean(process.env.TRIGGERCMD_DEVICES_URL);
    const hasExecuteUrl = Boolean(process.env.TRIGGERCMD_EXECUTE_URL);
    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || "";
    const hasToken = Boolean(tokenRaw);
    console.log(`[TRIGGER_CMD] Runtime sync active interval=${TRIGGER_REFRESH_INTERVAL_MS}ms`);
    console.log(`[TRIGGER_CMD_INIT] Env Check: hasDevicesUrl=${hasDevicesUrl}, hasExecuteUrl=${hasExecuteUrl}, hasToken=${hasToken}`);
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refreshDevices("interval").catch(() => {
        });
      }, TRIGGER_REFRESH_INTERVAL_MS);
    }
    this.refreshDevices("startup").catch(() => {
    });
  }
  // ──────────────── Persistence (survives server restart) ────────────────
  async loadPersistedConfigs() {
    try {
      await this.tryInitFirestore();
      if (this.firestoreEnabled && this.firestoreDb) {
        try {
          const snapshot = await this.firestoreDb.collection("triggercmd_configs").get();
          snapshot.forEach((doc) => {
            const parsed = doc.data();
            if (parsed && parsed.token) {
              if (parsed.endpoint) parsed.endpoint = this.normalizeTriggerEndpoint(parsed.endpoint, "list");
              this.userConfigs.set(doc.id, parsed);
              console.log(`[TRIGGER_PERSIST] restored config from firestore userId=${doc.id} token_length=${parsed.token?.length || 0}`);
            }
          });
          console.log(`[TRIGGER_PERSIST] restored ${this.userConfigs.size} user configs from firestore`);
          return;
        } catch (err) {
          console.log("[TRIGGER_PERSIST] failed to read from firestore, falling back to file:", err);
        }
      }
      if (!fs.existsSync(this.persistenceFilePath)) {
        console.log("[TRIGGER_PERSIST] no persisted configs found at", this.persistenceFilePath);
        return;
      }
      const raw = fs.readFileSync(this.persistenceFilePath, "utf-8");
      const data = JSON.parse(raw);
      if (typeof data !== "object" || data === null) return;
      for (const [userId, cfg] of Object.entries(data)) {
        const parsed = cfg;
        if (userId && parsed.token) {
          if (parsed.endpoint) {
            parsed.endpoint = this.normalizeTriggerEndpoint(parsed.endpoint, "list");
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
  savePersistedConfigs() {
    (async () => {
      try {
        await this.tryInitFirestore();
        if (this.firestoreEnabled && this.firestoreDb) {
          try {
            const batch = this.firestoreDb.batch();
            for (const [userId, cfg] of this.userConfigs.entries()) {
              const ref = this.firestoreDb.collection("triggercmd_configs").doc(userId);
              batch.set(ref, cfg);
            }
            await batch.commit();
            console.log("[TRIGGER_PERSIST] saved configs to firestore");
            return;
          } catch (err) {
            console.log("[TRIGGER_PERSIST] failed to save to firestore, will fallback to file:", err);
          }
        }
      } catch (err) {
        console.log("[TRIGGER_PERSIST] firestore init error, falling back to file:", err);
      }
      try {
        if (!fs.existsSync(this.persistenceDir)) {
          fs.mkdirSync(this.persistenceDir, { recursive: true });
        }
        const data = {};
        for (const [userId, cfg] of this.userConfigs.entries()) {
          data[userId] = cfg;
        }
        fs.writeFileSync(this.persistenceFilePath, JSON.stringify(data, null, 2), "utf-8");
        console.log("[TRIGGER_PERSIST] saved configs to disk");
      } catch (err) {
        console.log(`[TRIGGER_PERSIST] failed to save configs: ${err}`);
      }
    })();
  }
  // ──────────────── User-Scoped Config ────────────────
  saveUserConfig(userId, config) {
    if (!userId) return false;
    const existing = this.userConfigs.get(userId) || { token: "" };
    const hadToken = existing.token.length > 0;
    const updated = {
      ...existing,
      ...config,
      endpoint: config.endpoint !== void 0 ? this.normalizeTriggerEndpoint(config.endpoint, "list") : existing.endpoint,
      syncedAt: config.syncedAt ?? existing.syncedAt ?? void 0,
      deviceCount: config.deviceCount ?? existing.deviceCount ?? void 0
    };
    if (config.token !== void 0) {
      updated.token = config.token;
    }
    this.userConfigs.set(userId, updated);
    const masked = this.maskToken(updated.token);
    console.log(`[TRIGGER_CONFIG] saving token userId=${userId} current_state=${hadToken ? "had_token" : "no_token"} token=${masked}`);
    this.savePersistedConfigs();
    return true;
  }
  getUserConfig(userId) {
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
  getUserConfigRaw(userId) {
    return this.userConfigs.get(userId);
  }
  removeUserConfig(userId) {
    if (!userId) return;
    this.cleanupUserSession(userId);
    this.userConfigs.delete(userId);
    this.savePersistedConfigs();
    console.log(`[TRIGGER_CONFIG] full config deleted userId=${userId}`);
  }
  cleanupUserSession(userId) {
    if (!userId) return;
    this.stopUserAutoRefresh(userId);
    this.userDevicesCache.delete(userId);
    this.userLastSignatures.delete(userId);
    console.log(`[TRIGGER_CONFIG] session cache cleared userId=${userId} (config preserved)`);
  }
  // ──────────────── User-Scoped Sync ────────────────
  async syncUserDevices(userId) {
    console.log(`[TRIGGER_SYNC] enter_sync userId=${userId}`);
    const config = this.getUserConfigRaw(userId);
    console.log(`[TRIGGER_SYNC] config_found=${!!config} has_token=${config?.token ? config.token.length + " chars" : "no"}`);
    if (!config || !config.token) {
      console.log(`[TRIGGER_SYNC] user=${userId} no token configured`);
      return { success: false, count: 0, status: "no_token" };
    }
    const existingCache = this.userDevicesCache.get(userId);
    console.log(`[TRIGGER_SYNC] existing_cache=${existingCache?.length || 0} items for userId=${userId}`);
    const endpoint = config.endpoint || process.env.TRIGGERCMD_DEVICES_URL || "";
    if (endpoint === process.env.TRIGGERCMD_DEVICES_URL || "") {
      console.log(`[TRIGGER_SYNC] endpoint_source=env_var value="${endpoint ? endpoint.substring(0, 80) + "..." : "(empty)"}"`);
    } else {
      console.log(`[TRIGGER_SYNC] endpoint_source=user_config value="${endpoint ? endpoint.substring(0, 80) + "..." : "(empty)"}"`);
    }
    if (!endpoint) {
      console.log(`[TRIGGER_SYNC] user=${userId} no endpoint configured \u2014 both user config and env var are empty`);
      return { success: false, count: 0, status: "no_endpoint" };
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
      if (this.io) {
        this.io.to(`user:${userId}`).emit("trigger:devices", outcome.devices);
        console.log(`[TRIGGER_HYDRATION] emitted count=${outcome.devices.length} room=user:${userId}`);
      }
      return { success: true, count: outcome.devices.length, status: "synced", devices: outcome.devices };
    }
    const existing = this.userDevicesCache.get(userId);
    if (existing && existing.length > 0) {
      return { success: true, count: existing.length, status: "cache", devices: existing };
    }
    return { success: false, count: 0, status: outcome.reason === "token_rejected" ? "invalid_token" : outcome.reason, devices: [] };
  }
  getDevicesForUser(userId) {
    if (!userId) return [];
    return this.userDevicesCache.get(userId) || [];
  }
  executeForUser(userId, deviceId) {
    if (!userId || !deviceId) return false;
    const devices = this.userDevicesCache.get(userId) || [];
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return false;
    const config = this.getUserConfigRaw(userId);
    const token = config?.token || "";
    const endpoint = this.resolveExecuteEndpoint(config?.endpoint || process.env.TRIGGERCMD_EXECUTE_URL || "");
    if (!token || !endpoint) {
      console.warn(`[TRIGGER_RUNTIME] Execute skipped for user=${userId}: missing token or endpoint`);
      return false;
    }
    console.log(`[TRIGGER_RUNTIME] isolated runtime ready \u2014 executing ${device.name} for user=${userId}`);
    this.executeRemoteWithToken(endpoint, token, device).catch((error) => {
      const message = error instanceof Error ? error.message : "unknown_error";
      console.warn(`[TRIGGER_RUNTIME] Remote execute failed for user=${userId} (${message})`);
    });
    return true;
  }
  startUserAutoRefresh(userId) {
    if (this.userRefreshTimers.has(userId)) return;
    const timer = setInterval(() => {
      this.syncUserDevices(userId).catch(() => {
      });
    }, TRIGGER_REFRESH_INTERVAL_MS);
    this.userRefreshTimers.set(userId, timer);
    console.log(`[TRIGGER_RUNTIME] isolated runtime ready userId=${userId}`);
  }
  stopUserAutoRefresh(userId) {
    const timer = this.userRefreshTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.userRefreshTimers.delete(userId);
    }
  }
  userHasConfig(userId) {
    return this.userConfigs.has(userId) && Boolean(this.userConfigs.get(userId)?.token);
  }
  // ──────────────── Token Masking ────────────────
  maskToken(token) {
    if (!token || token.length < 8) return token ? token.substring(0, 4) + "****" : "";
    return token.substring(0, 4) + "****" + token.substring(token.length - 4);
  }
  // ──────────────── Legacy Methods (Global) ────────────────
  getDevices() {
    return this.globalDevicesCache;
  }
  execute(deviceId) {
    if (!deviceId) return false;
    const device = this.globalDevicesCache.find((d) => d.id === deviceId);
    if (device) {
      console.log(`[TRIGGER_CMD] Executing ${device.name} on ${device.server}`);
      this.executeRemote(device).catch((error) => {
        const message = error instanceof Error ? error.message : "unknown_error";
        console.warn(`[TRIGGER_CMD] Remote execute failed (${message})`);
      });
      return true;
    }
    return false;
  }
  // ──────────────── Internal: Refresh (Legacy) ────────────────
  async refreshDevices(reason) {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }
    this.refreshInFlight = this.performRefresh(reason).catch(() => {
    }).finally(() => {
      this.refreshInFlight = null;
    });
    await this.refreshInFlight;
  }
  async performRefresh(reason) {
    const remote = await this.fetchRemoteDevices();
    if (remote.attempted) {
      this.logFetchStatus(remote);
    }
    if (remote.devices.length > 0) {
      this.failureCount = 0;
      this.updateCache(remote.devices, reason, "REAL");
      return;
    }
    this.failureCount++;
    const fallbackSource = this.globalDevicesCache.length > 0 ? "CACHE" : "FALLBACK";
    const fallbackDevices = this.globalDevicesCache.length > 0 ? this.globalDevicesCache : this.resolveFallbackDevices();
    this.logFallbackReason(remote.reason, remote);
    this.updateCache(fallbackDevices, reason, fallbackSource);
  }
  updateCache(devices, reason, source) {
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
      this.io?.emit("trigger:devices", normalized);
      console.log(`[TRIGGER_CMD] Device sync source=${source} count=${normalized.length} reason=${reason}`);
    }
    console.log(`[TRIGGER_CMD_REGISTRY] Current registry status: activeDevicesCount=${this.globalDevicesCache.length} source=${source} devices=[${this.globalDevicesCache.map((d) => `${d.name} (${d.status})`).join(", ")}]`);
    this.lastSource = source;
  }
  resolveFallbackDevices() {
    if (this.globalDevicesCache.length > 0) {
      return this.globalDevicesCache;
    }
    return [...TRIGGER_FALLBACK_DEVICES];
  }
  // ──────────────── Internal: Fetch (User-Scoped) ────────────────
  async fetchRemoteDevicesForUser(endpoint, token) {
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
        reason: "missing_devices_endpoint"
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
        reason: "missing_token"
      };
    }
    let lastOutcome = null;
    for (const candidateUrl of candidateUrls) {
      const outcome = await this.fetchRemoteDevicesFromUrl(candidateUrl, sanitizedToken);
      lastOutcome = outcome;
      if (outcome.devices.length > 0) {
        return outcome;
      }
      if (outcome.reason === "token_rejected" || outcome.reason.startsWith("api_error:")) {
        return outcome;
      }
    }
    return lastOutcome || {
      devices: [],
      attempted: false,
      endpoint: null,
      status: null,
      tokenAccepted: null,
      reason: "missing_devices_endpoint"
    };
  }
  async fetchRemoteDevicesFromUrl(sanitizedUrl, sanitizedToken) {
    console.log(`[TRIGGER_FETCH] trying_endpoint=${sanitizedUrl}`);
    const headers = {
      Authorization: `Bearer ${sanitizedToken}`
    };
    const method = this.resolveHttpMethod(process.env.TRIGGERCMD_DEVICES_METHOD || "GET");
    console.log(`[TRIGGER_HTTP] url=${sanitizedUrl} method=${method} authorization_present=true token_length=${sanitizedToken.length}`);
    console.log(`[TRIGGER_HTTP] headers=${JSON.stringify({ Authorization: `Bearer ${this.maskToken(sanitizedToken)}`, ...headers })}`);
    let response = null;
    try {
      response = await fetch(sanitizedUrl, { method, headers });
    } catch (fetchError) {
      const errMsg = fetchError instanceof Error ? fetchError.message : "Unknown network error";
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
    const contentType = response.headers.get("content-type") || "(none)";
    const tokenAccepted = status !== 401;
    console.log(`[TRIGGER_HTTP] url=${sanitizedUrl} method=${method} status=${status} contentType=${contentType}`);
    console.log(`[TRIGGER_HTTP] status=${status} tokenAccepted=${tokenAccepted}`);
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text().then((t) => t.substring(0, 500));
      } catch {
      }
      console.log(`[TRIGGER_HTTP] error_body_preview=${errorBody}`);
      console.log(`[TRIGGER_CMD_FETCH] API responded with error status: ${status}. tokenAccepted=${tokenAccepted}`);
      return {
        devices: [],
        attempted: true,
        endpoint: sanitizedUrl,
        status,
        tokenAccepted,
        reason: status === 401 ? "token_rejected" : `http_${status}`
      };
    }
    const rawText = await response.text();
    console.log(`[TRIGGER_HTTP] raw_response_preview=${rawText.substring(0, 500)}`);
    const isJson = contentType.includes("json") || contentType.includes("javascript");
    const isHtml = contentType.includes("html");
    if (isHtml) {
      console.log(`[TRIGGER_PARSE] html_response_detected=true contentType=${contentType}`);
    }
    if (!isJson && !isHtml) {
      console.log(`[TRIGGER_PARSE] unknown_content_type=${contentType}`);
    }
    let payload = null;
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
        reason: "invalid_content_type"
      };
    }
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
      const payloadType = Array.isArray(payload) ? "array" : "object";
      const sampleKeys = Object.keys(payload);
      console.log(`[TRIGGER_PARSE] payload_received=true payload_type=${payloadType} root_keys=${JSON.stringify(sampleKeys)}`);
      if (list.length > 0) {
        const first = list[0];
        console.log(`[TRIGGER_NORMALIZE] first_item_keys=${JSON.stringify(Object.keys(first || {}))}`);
      } else if (Array.isArray(payload)) {
        console.log(`[TRIGGER_PARSE] direct_array_but_empty=true`);
      }
    } else {
      console.log(`[TRIGGER_PARSE] payload_received=false`);
    }
    console.log(`[TRIGGER_FETCH] Total received from account: ${list.length}`);
    let discardedCount = 0;
    const devices = [];
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
      reason: devices.length > 0 ? "remote_ok" : "payload_not_mapped"
    };
  }
  // ──────────────── Internal: Fetch (Legacy) ────────────────
  async fetchRemoteDevices() {
    const endpoint = this.sanitizeUrl(process.env.TRIGGERCMD_DEVICES_URL || "");
    if (!endpoint) {
      return {
        devices: [],
        attempted: false,
        endpoint: null,
        status: null,
        tokenAccepted: null,
        reason: "missing_devices_endpoint"
      };
    }
    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || "";
    const token = this.sanitizeToken(tokenRaw);
    if (!token) {
      return {
        devices: [],
        attempted: true,
        endpoint,
        status: null,
        tokenAccepted: null,
        reason: "missing_token"
      };
    }
    return this.fetchRemoteDevicesForUser(endpoint, token);
  }
  // ──────────────── Internal: Execute ────────────────
  async executeRemoteWithToken(endpoint, token, device) {
    const sanitizedEndpoint = this.sanitizeUrl(endpoint);
    if (!sanitizedEndpoint) return;
    const sanitizedToken = this.sanitizeToken(token);
    if (!sanitizedToken) {
      console.warn("[TRIGGER_RUNTIME] Execute skipped: missing token");
      return;
    }
    const headers = {
      "Content-Type": "application/json",
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
      params: ""
    };
    const response = await fetch(sanitizedEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      if (response.status === 401) {
        console.warn("[TRIGGER_RUNTIME] Execute token rejected (401)");
      }
      throw new Error(`trigger_execute_${response.status}`);
    }
  }
  async executeRemote(device) {
    const endpoint = this.sanitizeUrl(process.env.TRIGGERCMD_EXECUTE_URL || "");
    if (!endpoint) return;
    const tokenRaw = process.env.TRIGGERCMD_TOKEN || process.env.TRIGGERCMD_API_KEY || "";
    const token = this.sanitizeToken(tokenRaw);
    if (!token) {
      console.warn("[TRIGGER_RUNTIME] Execute skipped: missing token");
      return;
    }
    return this.executeRemoteWithToken(endpoint, token, device);
  }
  // ──────────────── Payload Parsing ────────────────
  extractCommandList(payload) {
    if (Array.isArray(payload)) {
      this.lastParsePath = "direct_array";
      console.log(`[TRIGGER_PARSE] parser_selected=direct_array count=${payload.length}`);
      return payload;
    }
    const root = this.toObject(payload);
    const rootKeys = Object.keys(root);
    console.log(`[TRIGGER_PARSE] payload_type=object root_keys=${JSON.stringify(rootKeys)}`);
    if (Array.isArray(root.records)) {
      this.lastParsePath = "root.records";
      return root.records;
    }
    if (Array.isArray(root.devices)) {
      this.lastParsePath = "root.devices";
      return root.devices;
    }
    if (Array.isArray(root.commands)) {
      this.lastParsePath = "root.commands";
      return root.commands;
    }
    if (Array.isArray(root.triggers)) {
      this.lastParsePath = "root.triggers";
      return root.triggers;
    }
    if (Array.isArray(root.computers)) {
      this.lastParsePath = "root.computers_flatten";
      console.log(`[TRIGGER_PARSE] flattening computers count=${root.computers.length}`);
      const allCommands = [];
      for (const comp of root.computers) {
        const compObj = this.toObject(comp);
        if (Array.isArray(compObj.commands)) {
          allCommands.push(...compObj.commands.map((cmd) => ({
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
      this.lastParsePath = "root.data.records";
      return data.records;
    }
    for (const key of ["devices", "commands", "triggers", "computers", "items", "list", "result", "results", "data"]) {
      if (Array.isArray(data[key])) {
        if (key === "computers") {
          const allCommands = [];
          for (const comp of data[key]) {
            const compObj = this.toObject(comp);
            if (Array.isArray(compObj.commands)) {
              allCommands.push(...compObj.commands.map((cmd) => ({
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
    for (const key of ["items", "list", "result", "results", "data"]) {
      if (Array.isArray(root[key])) {
        this.lastParsePath = `root.${key}`;
        return root[key];
      }
    }
    this.lastParsePath = "none";
    console.log(`[TRIGGER_PARSE] parser_selected=none \u2014 no array found in payload. keys=${JSON.stringify(rootKeys)}`);
    return [];
  }
  normalizeDevice(raw) {
    if (!raw || typeof raw !== "object") {
      console.log(`[TRIGGER_NORMALIZE] accepted=false reason=not_object raw_type=${typeof raw}`);
      return null;
    }
    const device = raw;
    const rawKeys = Object.keys(device);
    const computer = this.toObject(device.computer);
    const trigger = this.toStringValue(device.trigger);
    const commandText = this.toStringValue(device.command) || this.toStringValue(device.cmd);
    const name = this.toStringValue(device.name) || trigger || commandText;
    const aliases = this.toStringArray(device.aliases || device.alias || device.altNames || []);
    const category = this.toStringValue(device.category) || this.toStringValue(device.type) || this.toStringValue(device.group) || this.inferCategory(name || commandText || "");
    const app2 = this.toStringValue(device.app) || this.toStringValue(device.application) || this.toStringValue(device.process) || this.toStringValue(device.executable) || this.extractLabel(commandText || name || "");
    const cmd = trigger || this.toStringValue(device.cmd) || commandText || name;
    const server = this.toStringValue(device.server) || this.toStringValue(device.computer) || this.toStringValue(device.computerName) || this.toStringValue(device.voice) || this.toStringValue(computer.name) || this.toStringValue(computer.computerName) || this.toStringValue(computer.voice) || "TRIGGERCMD_NODE";
    const id = this.toStringValue(device.id) || this.toStringValue(device.deviceId) || this.toStringValue(device._id) || `${server}:${cmd}`;
    let status = "ONLINE";
    if (device.status !== void 0) {
      status = this.toStringValue(device.status) || "ONLINE";
    } else if (computer && typeof computer.connected === "boolean") {
      status = computer.connected ? "ONLINE" : "OFFLINE";
    }
    if (!id || !name || !cmd) {
      const discardReason = !id ? "missing_id" : !name ? "missing_name" : "missing_cmd";
      console.log(`[TRIGGER_NORMALIZE] accepted=false reason=${discardReason} raw_keys=${JSON.stringify(rawKeys)} id=${id} name=${name} cmd=${cmd}`);
      return null;
    }
    console.log(`[TRIGGER_NORMALIZE] accepted=true id=${id} name=${name} server=${server} status=${status}`);
    return { id, name, cmd, server, status: status.toUpperCase(), aliases, provider: "TriggerCMD", source: server, app: app2, category };
  }
  // ──────────────── Helpers ────────────────
  sanitizeToken(value) {
    let token = (value || "").trim();
    if (!token) return "";
    if (token.startsWith('"') && token.endsWith('"') || token.startsWith("'") && token.endsWith("'")) {
      token = token.slice(1, -1).trim();
    }
    token = token.replace(/^Bearer\s+/i, "").trim();
    return token;
  }
  toStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => this.toStringValue(entry)).filter((entry) => Boolean(entry));
  }
  inferCategory(value) {
    const lowered = value.toLowerCase();
    if (lowered.includes("spotify") || lowered.includes("discord") || lowered.includes("steam")) return "app";
    if (lowered.includes("bluetooth") || lowered.includes("headset") || lowered.includes("device")) return "device";
    return "automation";
  }
  extractLabel(value) {
    const normalized = value.split(/[\\/]/).filter(Boolean).pop() || value;
    return normalized.replace(/\.[^.]+$/, "");
  }
  sanitizeUrl(value) {
    let url = (value || "").trim();
    if (!url) return "";
    if (url.startsWith('"') && url.endsWith('"') || url.startsWith("'") && url.endsWith("'")) {
      url = url.slice(1, -1).trim();
    }
    return url;
  }
  resolveDeviceFetchCandidates(endpoint) {
    const sanitized = this.sanitizeUrl(endpoint);
    if (!sanitized) return [];
    const normalized = this.normalizeTriggerEndpoint(sanitized, "list");
    return [...new Set([normalized, sanitized].filter(Boolean))];
  }
  resolveExecuteEndpoint(endpoint) {
    const sanitized = this.sanitizeUrl(endpoint);
    if (!sanitized) {
      return `${this.defaultTriggerApiOrigin}/api/run/trigger`;
    }
    return this.normalizeTriggerEndpoint(sanitized, "execute");
  }
  normalizeTriggerEndpoint(value, mode) {
    const sanitized = this.sanitizeUrl(value);
    if (!sanitized) return "";
    try {
      const url = new URL(sanitized);
      const isTriggerCmdHost = /(^|\.)triggercmd\.com$/i.test(url.hostname);
      if (!isTriggerCmdHost) {
        return sanitized;
      }
      if (mode === "list") {
        if (url.pathname === "/user/command/list" || url.pathname === "/api/command/list") {
          url.pathname = "/api/command/list";
        } else if (url.pathname === "/user/computer/list" || url.pathname === "/api/computer/list") {
          url.pathname = "/api/computer/list";
        }
      }
      if (mode === "execute") {
        if (url.pathname === "/user/command/list" || url.pathname === "/api/command/list" || url.pathname === "/user/computer/list" || url.pathname === "/api/computer/list" || url.pathname === "/user/run/trigger") {
          url.pathname = "/api/run/trigger";
          url.search = "";
        }
      }
      return url.toString();
    } catch {
      return sanitized;
    }
  }
  resolveHttpMethod(value) {
    const method = (value || "GET").trim().toUpperCase();
    return method === "POST" ? "POST" : "GET";
  }
  logFetchStatus(outcome) {
    const tokenStatus = outcome.tokenAccepted === true ? "accepted" : outcome.tokenAccepted === false ? "rejected" : "unavailable";
    const status = outcome.status === null ? "n/a" : `${outcome.status}`;
    const key = `${outcome.endpoint}|${status}|${tokenStatus}|${outcome.reason}`;
    if (key === this.lastFetchStatusLog) return;
    this.lastFetchStatusLog = key;
    console.log(`[TRIGGER_CMD] Fetch status=${status} token=${tokenStatus} endpoint=${outcome.endpoint} reason=${outcome.reason}`);
  }
  logFallbackReason(reason, outcome) {
    const status = outcome.status === null ? "n/a" : `${outcome.status}`;
    const key = `${reason}|${status}|${outcome.endpoint}`;
    if (key === this.lastFallbackReason) return;
    this.lastFallbackReason = key;
    console.log(`[TRIGGER_CMD] Fallback reason=${reason} status=${status} endpoint=${outcome.endpoint}`);
  }
  toObject(value) {
    if (!value || typeof value !== "object") return {};
    return value;
  }
  toStringValue(value) {
    if (typeof value !== "string" || value.trim().length === 0) return null;
    return value.trim();
  }
};
var triggerCmdService = TriggerCMDService.getInstance();

// server/services/GoogleHomeService.ts
var MOCK_DEVICES = [
  {
    id: "gh_light_01",
    name: "Living Room Light",
    type: "LIGHT",
    room: "Living Room",
    status: "ONLINE",
    activity: "IDLE",
    lastSeen: Date.now(),
    traits: {
      brightness: { name: "brightness", value: 80, updatedAt: Date.now() },
      color: { name: "color", value: "#FFFFFF", updatedAt: Date.now() }
    },
    metadata: { manufacturer: "Philips", model: "Hue White" }
  },
  {
    id: "gh_tv_01",
    name: "Main TV",
    type: "TV",
    room: "Living Room",
    status: "ONLINE",
    activity: "ACTIVE",
    lastSeen: Date.now(),
    traits: {
      volume: { name: "volume", value: 25, updatedAt: Date.now() },
      activeApp: { name: "activeApp", value: "Youtube", updatedAt: Date.now() }
    },
    metadata: { manufacturer: "Samsung", model: "QLED 4K" }
  },
  {
    id: "gh_outlet_01",
    name: "Coffee Maker",
    type: "OUTLET",
    room: "Kitchen",
    status: "OFFLINE",
    activity: "UNKNOWN",
    lastSeen: Date.now() - 36e5,
    traits: {
      power: { name: "power", value: false, updatedAt: Date.now() }
    },
    metadata: { manufacturer: "TP-Link", model: "Kasa Smart" }
  },
  {
    id: "gh_speaker_01",
    name: "Kitchen Speaker",
    type: "SPEAKER",
    room: "Kitchen",
    status: "ONLINE",
    activity: "IDLE",
    lastSeen: Date.now(),
    traits: {
      volume: { name: "volume", value: 40, updatedAt: Date.now() }
    },
    metadata: { manufacturer: "Google", model: "Nest Mini" }
  }
];
var GOOGLE_REFRESH_INTERVAL_MS = 3 * 60 * 1e3;
var GOOGLE_STALE_MS = 2 * 60 * 1e3;
var GoogleHomeService = class _GoogleHomeService {
  static instance;
  io = null;
  devicesCache = this.cloneMockDevices();
  lastSync = 0;
  source = "MOCK";
  refreshInterval = null;
  refreshInFlight = null;
  lastEmitSignature = "";
  failureCount = 0;
  constructor() {
  }
  static getInstance() {
    if (!_GoogleHomeService.instance) {
      _GoogleHomeService.instance = new _GoogleHomeService();
    }
    return _GoogleHomeService.instance;
  }
  init(io2) {
    this.io = io2;
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        this.refreshEcosystem("interval").catch(() => {
        });
      }, GOOGLE_REFRESH_INTERVAL_MS);
    }
    this.refreshEcosystem("startup").catch(() => {
    });
  }
  async getEcosystemSnapshot() {
    if (Date.now() - this.lastSync > GOOGLE_STALE_MS) {
      this.refreshEcosystem("stale-request").catch(() => {
      });
    }
    return this.devicesCache;
  }
  getCachedDevices() {
    return this.devicesCache;
  }
  async refreshEcosystem(reason) {
    if (this.refreshInFlight) {
      await this.refreshInFlight;
      return;
    }
    this.refreshInFlight = this.performRefresh(reason).catch(() => {
    }).finally(() => {
      this.refreshInFlight = null;
    });
    await this.refreshInFlight;
  }
  async performRefresh(reason) {
    const realDevices = await this.fetchRealDevices();
    const resolvedDevices = realDevices.length > 0 ? realDevices : this.cloneMockDevices();
    const resolvedSource = realDevices.length > 0 ? "REAL" : "MOCK";
    this.lastSync = Date.now();
    this.source = resolvedSource;
    this.updateCache(resolvedDevices, reason);
  }
  updateCache(devices, reason) {
    if (!Array.isArray(devices)) {
      return;
    }
    const normalized = devices.filter(Boolean);
    const signature = this.buildSignature(normalized);
    const changed = signature !== this.lastEmitSignature;
    this.devicesCache = normalized;
    if (changed) {
      this.lastEmitSignature = signature;
      this.io?.emit("google:device_sync", normalized);
      console.log(`[GOOGLE_HOME] Sync update (${this.source}) devices=${normalized.length} reason=${reason}`);
    }
  }
  async fetchRealDevices() {
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
        console.warn("[GOOGLE_HOME] Real integration unavailable. Using fallback snapshot.");
      }
      return [];
    } catch (error) {
      this.failureCount++;
      if (this.failureCount % 5 === 1) {
        const msg = error instanceof Error ? error.message : "unknown_error";
        console.warn(`[GOOGLE_HOME] Real integration failed (${msg}). Using fallback snapshot.`);
      }
      return [];
    }
  }
  async fetchFromCustomEndpoint() {
    const endpoint = process.env.GOOGLE_HOME_DEVICES_URL;
    if (!endpoint) {
      return [];
    }
    const token = process.env.GOOGLE_HOME_ACCESS_TOKEN || process.env.GOOGLE_API_ACCESS_TOKEN || "";
    const headers = {};
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
    return payload.map((raw) => this.normalizeDevice(raw)).filter((device) => device !== null);
  }
  async fetchFromSdm() {
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
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.devices)) {
      return [];
    }
    return payload.devices.map((raw) => this.normalizeSdmDevice(raw)).filter((device) => device !== null);
  }
  normalizeSdmDevice(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const candidate = raw;
    const name = this.toStringValue(candidate.name) || "";
    const shortName = name.split("/").pop() || "unknown";
    const traits = this.toObject(candidate.traits);
    const parentRelations = Array.isArray(candidate.parentRelations) ? candidate.parentRelations : [];
    const info = this.toObject(parentRelations[0]);
    const roomName = this.toStringValue(info.displayName) || void 0;
    const type = this.mapSdmType(this.toStringValue(candidate.type));
    const online = this.isSdmOnline(traits);
    const activity = online ? "IDLE" : "UNKNOWN";
    return {
      id: `sdm_${shortName}`,
      name: this.toStringValue(candidate.customName) || shortName,
      type,
      room: roomName,
      status: online ? "ONLINE" : "OFFLINE",
      activity,
      lastSeen: Date.now(),
      traits: this.normalizeTraits(traits),
      metadata: {
        manufacturer: this.toStringValue(candidate.assignee) || void 0,
        model: this.toStringValue(candidate.type) || void 0
      }
    };
  }
  normalizeDevice(raw) {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const device = raw;
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
      room: this.toStringValue(device.room) || void 0,
      status: this.toStatus(device.status),
      activity: this.toActivity(device.activity),
      lastSeen: this.toNumber(device.lastSeen) || Date.now(),
      traits,
      metadata: {
        manufacturer: this.toStringValue(metadata.manufacturer) || void 0,
        model: this.toStringValue(metadata.model) || void 0,
        hwVersion: this.toStringValue(metadata.hwVersion) || void 0,
        swVersion: this.toStringValue(metadata.swVersion) || void 0
      }
    };
  }
  normalizeTraits(traitsInput) {
    const traits = {};
    const now = Date.now();
    Object.entries(traitsInput).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        const traitObj = value;
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
  buildSignature(devices) {
    return JSON.stringify(
      devices.slice().sort((a, b) => a.id.localeCompare(b.id)).map((device) => {
        const traitValues = Object.fromEntries(
          Object.entries(device.traits).sort(([a], [b]) => a.localeCompare(b)).map(([key, trait]) => [key, trait?.value])
        );
        return {
          id: device.id,
          status: device.status,
          activity: device.activity,
          type: device.type,
          room: device.room || "",
          traits: traitValues
        };
      })
    );
  }
  cloneMockDevices() {
    const now = Date.now();
    return MOCK_DEVICES.map((device) => ({
      ...device,
      lastSeen: device.status === "ONLINE" ? now : device.lastSeen,
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
  mapSdmType(type) {
    if (!type) return "UNKNOWN";
    const normalized = type.toLowerCase();
    if (normalized.includes("thermostat")) return "THERMOSTAT";
    if (normalized.includes("camera")) return "SENSOR";
    if (normalized.includes("display")) return "SPEAKER";
    if (normalized.includes("speaker")) return "SPEAKER";
    if (normalized.includes("light")) return "LIGHT";
    return "UNKNOWN";
  }
  isSdmOnline(traits) {
    const connectivity = this.toObject(traits["sdm.devices.traits.Connectivity"]);
    const status = this.toStringValue(connectivity.status);
    return status === "ONLINE";
  }
  toStatus(value) {
    const status = this.toStringValue(value)?.toUpperCase();
    if (status === "ONLINE" || status === "OFFLINE" || status === "CONNECTING") {
      return status;
    }
    return "ONLINE";
  }
  toActivity(value) {
    const activity = this.toStringValue(value)?.toUpperCase();
    if (activity === "ACTIVE" || activity === "IDLE" || activity === "BUSY" || activity === "SLEEPING") {
      return activity;
    }
    return "UNKNOWN";
  }
  toObject(value) {
    if (!value || typeof value !== "object") {
      return {};
    }
    return value;
  }
  toStringValue(value) {
    if (typeof value !== "string") {
      return null;
    }
    return value;
  }
  toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }
};
var googleHomeService = GoogleHomeService.getInstance();

// server/services/AuthService.ts
var AuthService = class _AuthService {
  static instance;
  isLinked = false;
  lastSync = 0;
  constructor() {
  }
  static getInstance() {
    if (!_AuthService.instance) {
      _AuthService.instance = new _AuthService();
    }
    return _AuthService.instance;
  }
  getStatus() {
    return { linked: this.isLinked, lastSync: this.lastSync };
  }
  setAuthenticated(status) {
    this.isLinked = status;
    if (status) this.lastSync = Date.now();
  }
};
var authService = AuthService.getInstance();

// server/services/ElevenLabsVoiceService.ts
var import_axios = __toESM(require("axios"), 1);
var import_https = __toESM(require("https"), 1);
var ElevenLabsServiceError = class extends Error {
  statusCode;
  responseBody;
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = "ElevenLabsServiceError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
};
var ElevenLabsVoiceService = class {
  baseUrl = "https://api.elevenlabs.io/v1";
  modelId = "eleven_multilingual_v2";
  outputFormat = "mp3_44100_128";
  requestTimeoutMs = 3e4;
  voiceSettings = {
    stability: 0.64,
    similarity_boost: 0.78,
    style: 0.18,
    use_speaker_boost: true
  };
  speechRate = 0.96;
  pacingProfile = "conversational_soft";
  warmupIntervalMs = 4 * 60 * 1e3;
  http = import_axios.default.create({
    httpsAgent: new import_https.default.Agent({
      keepAlive: true,
      keepAliveMsecs: 1e4,
      maxSockets: 10
    })
  });
  lastVoiceValidation = null;
  warmupTimer = null;
  isConfigured(voiceIdOverride) {
    return !!(this.getApiKey() && this.resolveVoiceId(voiceIdOverride));
  }
  getActiveVoiceId() {
    return this.getConfiguredVoiceId();
  }
  getModelId() {
    return this.modelId;
  }
  getOutputFormat() {
    return this.outputFormat;
  }
  async synthesize(options) {
    const { text, profile, provider, sessionId, requestId, voiceConfig } = options;
    const apiKey = this.getApiKey();
    const requestedVoiceId = typeof voiceConfig?.voiceId === "string" ? voiceConfig.voiceId.trim() : "";
    const voiceSource = requestedVoiceId ? "client_override" : "env_default";
    const voiceId = this.resolveVoiceId(requestedVoiceId);
    const likelyProfileAlias = this.isLikelyProfileAlias(requestedVoiceId, voiceId);
    const modelId = voiceConfig?.modelId || this.modelId;
    const outputFormat = voiceConfig?.outputFormat || this.outputFormat;
    const optimizeStreamingLatency = typeof voiceConfig?.optimizeStreamingLatency === "number" ? voiceConfig.optimizeStreamingLatency : 2;
    const voiceSettings = {
      stability: typeof voiceConfig?.stability === "number" ? voiceConfig.stability : this.voiceSettings.stability,
      similarity_boost: typeof voiceConfig?.similarityBoost === "number" ? voiceConfig.similarityBoost : this.voiceSettings.similarity_boost,
      style: typeof voiceConfig?.style === "number" ? voiceConfig.style : this.voiceSettings.style,
      use_speaker_boost: typeof voiceConfig?.speakerBoost === "boolean" ? voiceConfig.speakerBoost : this.voiceSettings.use_speaker_boost
    };
    const speechRate = typeof voiceConfig?.speechRate === "number" ? voiceConfig.speechRate : this.speechRate;
    const pacingProfile = voiceConfig?.pacingProfile || this.pacingProfile;
    const startupBufferMs = typeof voiceConfig?.startupBufferMs === "number" ? voiceConfig.startupBufferMs : 160;
    if (!apiKey || !voiceId) {
      console.error("[VOICE_503] reason=backend_not_configured");
      throw new ElevenLabsServiceError("ElevenLabs not configured", 503);
    }
    if (!text || text.trim().length === 0) {
      throw new ElevenLabsServiceError("Empty text", 400);
    }
    const validation = await this.validateVoice(voiceId, apiKey, requestId);
    const endpoint = `${this.baseUrl}/text-to-speech/${voiceId}/stream`;
    const query = `output_format=${outputFormat}&optimize_streaming_latency=${optimizeStreamingLatency}`;
    const url = `${endpoint}?${query}`;
    const payload = {
      text,
      model_id: modelId,
      voice_settings: voiceSettings
    };
    const payloadText = JSON.stringify(payload);
    console.log(
      `[VOICE_HTTP] method=POST endpoint=${endpoint} query=${query} timeout_ms=${this.requestTimeoutMs} session=${sessionId || "none"} request=${requestId || "none"}`
    );
    console.log(
      `[TTS_REQUEST] provider=${provider || "elevenlabs"} profile=${profile || "none"} requested_voice_id=${requestedVoiceId || "none"} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)} voice_name=${validation.meta.voiceName} category=${validation.meta.category} model=${modelId} output_format=${outputFormat} payload_size=${payloadText.length}`
    );
    console.log(
      `[ELEVENLABS_AUDIO] session=${sessionId || "none"} request=${requestId || "none"} requested_voice_id=${requestedVoiceId || "none"} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)}`
    );
    console.log(
      `[VOICE_NATURALIZATION] speech_rate=${speechRate.toFixed(2)} pacing_profile=${pacingProfile} stability=${voiceSettings.stability} style=${voiceSettings.style} startup_buffer_ms=${startupBufferMs} playback_transition_mode=stream_soft`
    );
    if (!validation.validated) {
      console.warn(
        `[VOICE_RESPONSE] validation=voice_lookup non_blocking=true voice_id=${voiceId} reason=${validation.reason || "unknown"} continuing_synthesis=true`
      );
      console.warn(
        `[PROVIDER_VALIDATION] provider=elevenlabs session=${sessionId || "none"} request=${requestId || "none"} validated=false reason=${validation.reason || "unknown"} requested_voice_id=${requestedVoiceId || "none"} resolved_voice_id=${voiceId} likely_profile_alias=${String(likelyProfileAlias)}`
      );
    }
    try {
      const response = await this.http.post(url, payload, {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg"
        },
        responseType: "stream",
        timeout: this.requestTimeoutMs
      });
      const contentType = typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : "audio/mpeg";
      console.log(
        `[TTS_RESPONSE] provider=elevenlabs status=${response.status} requested_voice_id=${requestedVoiceId || "none"} resolved_voice_id=${voiceId} model=${modelId} output_format=${outputFormat} content_type=${contentType} streaming=true`
      );
      return {
        audioStream: response.data,
        contentType,
        voiceId,
        requestedVoiceId: requestedVoiceId || voiceId,
        voiceSource,
        voiceValidationState: validation.validated ? "validated" : "unverified",
        likelyProfileAlias,
        modelId,
        outputFormat
      };
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        const body = this.summarizeBody(err.response.data);
        console.error(
          `[TTS_RESPONSE] provider=elevenlabs status=${status} requested_voice_id=${requestedVoiceId || "none"} resolved_voice_id=${voiceId} voice_source=${voiceSource} likely_profile_alias=${String(likelyProfileAlias)} model=${modelId} output_format=${outputFormat} body=${body}`
        );
        if (status === 503) {
          console.error(
            `[VOICE_503] provider=elevenlabs status=503 voice_id=${voiceId} model=${modelId} output_format=${outputFormat} body=${body}`
          );
        }
        if (status === 401) {
          throw new ElevenLabsServiceError(`ElevenLabs unauthorized: ${body}`, 401, body);
        }
        if (status === 404) {
          throw new ElevenLabsServiceError(`ElevenLabs voice not found: ${voiceId}`, 404, body);
        }
        if (status === 429) {
          throw new ElevenLabsServiceError("ElevenLabs quota exceeded", 429, body);
        }
        throw new ElevenLabsServiceError(`ElevenLabs API error ${status}: ${body}`, status, body);
      }
      if (err.code === "ECONNABORTED") {
        throw new ElevenLabsServiceError("ElevenLabs request timed out", 504);
      }
      throw new ElevenLabsServiceError(err.message || "ElevenLabs request failed", 502);
    }
  }
  startWarmupLoop() {
    if (this.warmupTimer || !this.isConfigured()) {
      return;
    }
    void this.warmup("startup");
    this.warmupTimer = setInterval(() => {
      void this.warmup("keepalive");
    }, this.warmupIntervalMs);
  }
  getApiKey() {
    return process.env.ELEVENLABS_API_KEY || "";
  }
  getConfiguredVoiceId() {
    return process.env.ELEVENLABS_VOICE_ID || "";
  }
  resolveVoiceId(voiceIdOverride) {
    const override = typeof voiceIdOverride === "string" ? voiceIdOverride.trim() : "";
    if (!override || override === "eleven_rachel" || override.startsWith("browser_fallback_")) {
      return this.getConfiguredVoiceId();
    }
    return override;
  }
  isLikelyProfileAlias(requestedVoiceId, resolvedVoiceId) {
    if (!requestedVoiceId) {
      return false;
    }
    if (/^eleven_[a-z0-9_]+$/i.test(requestedVoiceId)) {
      return true;
    }
    return requestedVoiceId === resolvedVoiceId && requestedVoiceId.length < 12;
  }
  async validateVoice(voiceId, apiKey, requestId) {
    const now = Date.now();
    if (this.lastVoiceValidation && this.lastVoiceValidation.voiceId === voiceId && now - this.lastVoiceValidation.validatedAt < 5 * 60 * 1e3) {
      return { meta: this.lastVoiceValidation.meta, validated: true };
    }
    const endpoint = `${this.baseUrl}/voices/${voiceId}`;
    console.log(`[VOICE_HTTP] method=GET endpoint=${endpoint} validation=true request=${requestId || "none"}`);
    try {
      const response = await this.http.get(endpoint, {
        headers: {
          "xi-api-key": apiKey,
          Accept: "application/json"
        },
        timeout: 1e4
      });
      const meta = {
        voiceId: response.data?.voice_id || voiceId,
        voiceName: response.data?.name || "unknown",
        category: response.data?.category || "unknown"
      };
      this.lastVoiceValidation = {
        voiceId,
        validatedAt: now,
        meta
      };
      console.log(`[VOICE_RESPONSE] validation=voice_lookup status=${response.status} voice_id=${meta.voiceId} voice_name=${meta.voiceName} category=${meta.category}`);
      return { meta, validated: true };
    } catch (err) {
      if (err.response) {
        const status = err.response.status;
        const body = this.summarizeBody(err.response.data);
        console.error(`[VOICE_RESPONSE] validation=voice_lookup status=${status} voice_id=${voiceId} body=${body}`);
        if (status === 401 && /missing_permissions|voices_read/i.test(body)) {
          return {
            meta: {
              voiceId,
              voiceName: "unverified",
              category: "unverified"
            },
            validated: false,
            reason: "missing_permissions_voices_read"
          };
        }
        return {
          meta: {
            voiceId,
            voiceName: "unverified",
            category: "unverified"
          },
          validated: false,
          reason: `voice_lookup_http_${status}`
        };
      }
      return {
        meta: {
          voiceId,
          voiceName: "unverified",
          category: "unverified"
        },
        validated: false,
        reason: err.message || "voice_lookup_failed"
      };
    }
  }
  summarizeBody(data) {
    if (typeof data === "string") {
      return this.normalizeBody(data);
    }
    if (data instanceof ArrayBuffer) {
      return this.normalizeBody(Buffer.from(data).toString("utf8"));
    }
    if (ArrayBuffer.isView(data)) {
      return this.normalizeBody(Buffer.from(data.buffer).toString("utf8"));
    }
    if (data && typeof data === "object") {
      return this.normalizeBody(JSON.stringify(data));
    }
    return "unknown";
  }
  normalizeBody(value) {
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
  }
  async warmup(reason) {
    const apiKey = this.getApiKey();
    const voiceId = this.getConfiguredVoiceId();
    if (!apiKey || !voiceId) {
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await this.validateVoice(voiceId, apiKey, `warmup_${reason}_${startedAt}`);
      console.log(
        `[VOICE_WARMUP] provider=elevenlabs reason=${reason} success=true validated=${result.validated} voice_id=${result.meta.voiceId} duration_ms=${Date.now() - startedAt}`
      );
    } catch (err) {
      console.warn(
        `[VOICE_WARMUP] provider=elevenlabs reason=${reason} success=false error=${err?.message || err} duration_ms=${Date.now() - startedAt}`
      );
    }
  }
};
var elevenLabsVoiceService = new ElevenLabsVoiceService();

// server/server.ts
import_dotenv.default.config();
var genAI = new import_genai.GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});
var app = (0, import_express.default)();
var httpServer = (0, import_http.createServer)(app);
var io = new import_socket.Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 1e4,
  pingTimeout: 5e3,
  transports: ["websocket", "polling"]
});
async function setupApp() {
  console.log("--- ORION CORE SETUP ---");
  console.log("[SERVER] Environment check:", {
    VERCEL: !!process.env.VERCEL,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !!process.env.FIREBASE_SERVICE_ACCOUNT,
    TRIGGERCMD_DEVICES_URL: !!process.env.TRIGGERCMD_DEVICES_URL,
    TRIGGERCMD_EXECUTE_URL: !!process.env.TRIGGERCMD_EXECUTE_URL
  });
  backendMqttManager.init(io);
  triggerCmdService.init(io);
  googleHomeService.init(io);
  elevenLabsVoiceService.startWarmupLoop();
  app.use((0, import_cors.default)());
  app.use(import_express.default.json());
  try {
    const distDir = import_path.default.resolve(process.cwd(), "dist");
    const indexPath = import_path.default.join(distDir, "index.html");
    if (import_fs.default.existsSync(distDir) && import_fs.default.existsSync(indexPath)) {
      console.log("[SERVER] Serving static assets from", distDir);
      app.use(import_express.default.static(distDir));
      app.get(/^\/(?!api\/).*/, (req, res) => {
        res.sendFile(indexPath);
      });
    }
  } catch (err) {
    console.warn("[SERVER] static asset serving disabled, error while enabling:", err);
  }
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://*.googleusercontent.com https://www.gstatic.com",
      "connect-src 'self' https://*.firebaseio.com https://*.googleapis.com wss://*.hivemq.com:8884 wss://*.emqx.io:8084 ws: wss: https://api.elevenlabs.io",
      "frame-src 'self' https://*.firebaseapp.com",
      "media-src 'self' data: blob: https://api.elevenlabs.io",
      "object-src 'none'"
    ].join("; ");
    res.setHeader("Content-Security-Policy", csp);
    next();
  });
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: Date.now(),
      vercel: !!process.env.VERCEL,
      node: process.version
    });
  });
  app.get("/api/auth/status", (req, res) => res.json(authService.getStatus()));
  app.post("/api/auth/session", (req, res) => {
    authService.setAuthenticated(req.body.isAuthenticated);
    res.json({ success: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    authService.setAuthenticated(false);
    res.json({ success: true });
  });
  app.get("/api/voice/config", (req, res) => {
    try {
      res.json({ configuredVoiceId: elevenLabsVoiceService.getActiveVoiceId() });
    } catch (err) {
      console.error("[API] /api/voice/config failed:", err);
      res.status(500).json({ error: "voice_config_error" });
    }
  });
  app.get("/api/google-home/ecosystem", async (_req, res) => {
    try {
      const devices = await googleHomeService.getEcosystemSnapshot();
      res.json(Array.isArray(devices) ? devices : []);
    } catch (err) {
      console.error("[API] /api/google-home/ecosystem failed:", err);
      try {
        res.json(googleHomeService.getCachedDevices());
      } catch (_) {
        res.status(500).json({ error: "ecosystem_error" });
      }
    }
  });
  app.post("/api/orion/process", async (req, res) => {
    try {
      const result = await genAI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: req.body.prompt
      });
      res.json({ response: result.text });
    } catch (error) {
      res.status(500).json({ error: "Gemini processing failed" });
    }
  });
  app.post("/api/voice/tts", async (req, res) => {
    const { text, sessionId, voiceConfig } = req.body;
    if (!text) return res.status(400).json({ error: "Text required" });
    if (!elevenLabsVoiceService.isConfigured(voiceConfig?.voiceId)) return res.status(503).json({ error: "TTS not configured" });
    try {
      const result = await elevenLabsVoiceService.synthesize(req.body);
      res.set("Content-Type", result.contentType);
      res.set("X-TTS-Provider", "elevenlabs");
      result.audioStream.pipe(res);
    } catch (err) {
      res.status(err instanceof ElevenLabsServiceError ? err.statusCode : 502).json({ error: err.message });
    }
  });
  app.get("/api/triggercmd/config", (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId required" });
    res.json(triggerCmdService.getUserConfig(userId) || { hasToken: false });
  });
  app.post("/api/triggercmd/config", (req, res) => {
    const { userId, token, endpoint } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    triggerCmdService.saveUserConfig(userId, { token, endpoint });
    res.json({ success: true });
  });
  app.post("/api/triggercmd/sync", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    res.json(await triggerCmdService.syncUserDevices(userId));
  });
  app.post("/api/triggercmd/execute", async (req, res) => {
    const { userId, deviceId } = req.body;
    if (!userId || !deviceId) return res.status(400).json({ error: "userId and deviceId required" });
    try {
      const ok = triggerCmdService.executeForUser(userId, deviceId);
      res.json({ success: Boolean(ok) });
    } catch (err) {
      res.status(500).json({ error: "execute_error" });
    }
  });
  io.on("connection", (socket) => {
    socket.emit("mqtt:status", { connected: backendMqttManager.connected, timestamp: Date.now() });
    const devices = googleHomeService.getCachedDevices();
    if (devices.length > 0) socket.emit("google:device_sync", devices);
    socket.on("user:auth", ({ userId }) => {
      if (!userId) return;
      socket.data.userId = userId;
      socket.join(`user:${userId}`);
      socket.emit("trigger:devices", triggerCmdService.getDevicesForUser(userId));
      if (triggerCmdService.userHasConfig(userId)) {
        triggerCmdService.syncUserDevices(userId).catch(() => {
        });
        triggerCmdService.startUserAutoRefresh(userId);
      }
    });
<<<<<<< HEAD
    socket.on("mqtt:publish", ({ topic, message }) => {
      console.log(`[SOCKET] mqtt:publish to ${topic}`);
      backendMqttManager.publish(topic, message);
    });
    socket.on("mqtt:reconnect", () => {
      console.log("[SOCKET] mqtt:reconnect requested by client");
      backendMqttManager.forceReconnect();
    });
=======
>>>>>>> 1aa288f (fix: vercel backend runtime fase 01.2)
    socket.on("trigger:execute", ({ deviceId }, ack) => {
      const userId = socket.data.userId;
      const success = userId ? triggerCmdService.executeForUser(userId, deviceId) : triggerCmdService.execute(deviceId);
      ack?.({ success });
    });
    socket.on("disconnect", () => {
      if (socket.data.userId) triggerCmdService.cleanupUserSession(socket.data.userId);
    });
  });
}
<<<<<<< HEAD
if (!process.env.VERCEL) {
  setupApp().catch((err) => console.error("Setup failed:", err));
=======
setupApp().catch((err) => console.error("Setup failed:", err));
if (!process.env.VERCEL) {
>>>>>>> 1aa288f (fix: vercel backend runtime fase 01.2)
  const PORT = process.env.PORT || 3e3;
  httpServer.listen(PORT, () => {
    console.log(`ORION CORE running at http://localhost:${PORT}`);
  });
<<<<<<< HEAD
} else {
  setupApp().catch((err) => console.error("Vercel Setup failed:", err));
=======
>>>>>>> 1aa288f (fix: vercel backend runtime fase 01.2)
}
var server_default = app;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  app,
  httpServer,
  io
});
//# sourceMappingURL=server.cjs.map
