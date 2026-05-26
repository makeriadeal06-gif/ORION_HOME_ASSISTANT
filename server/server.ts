import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from "@google/genai";
import { backendMqttManager } from './mqtt/MqttManager';
import { triggerCmdService } from './services/TriggerCMDService';
import { googleHomeService } from './services/GoogleHomeService';
import { authService } from './services/AuthService';
import { nodeService } from './services/NodeService';
import { ElevenLabsServiceError, elevenLabsVoiceService } from './services/ElevenLabsVoiceService';

dotenv.config();

// Helpers
const __dirname = path.resolve();

// Gemini Setup
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

async function startServer() {
  console.log('--- ORION CORE BOOTSTRAP ---');
  console.log(`[WORKING DIRECTORY] ${process.cwd()}`);
  console.log(`[DIRNAME] ${__dirname}`);
  console.log(`[NODE_ENV] ${process.env.NODE_ENV}`);
  console.log(`[PROCESS_CWD] ${process.cwd()}`);
  
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Initialize Backend MQTT
  backendMqttManager.init(io);
  triggerCmdService.init(io);
  googleHomeService.init(io);
  elevenLabsVoiceService.startWarmupLoop();

  app.use(cors());
  app.use(express.json());

  // --- Cloud Deployment Hardening: Security Headers ---
  app.use((req, res, next) => {
    // Basic Security Headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Content Security Policy (CSP) - Hardened for ORION Production
    // Allows: Firebase, Google APIs, MQTT (WSS), Gemini, and Socket.io
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
    ].join('; ');
    
    res.setHeader('Content-Security-Policy', csp);
    next();
  });

  // Logging Middleware for debugging API routes
  app.use((req, res, next) => {
    console.log(`[API_REQ] ${req.method} ${req.url}`);
    next();
  });

  const activeVoiceRequests = new Set<string>();

  // --- API Routes ---
  
  app.get('/api/auth/status', (req, res) => {
    res.json(authService.getStatus());
  });

  app.post('/api/auth/session', (req, res) => {
    const { isAuthenticated } = req.body;
    authService.setAuthenticated(isAuthenticated);
    res.json({ success: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    authService.setAuthenticated(false);
    res.json({ success: true });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/voice/config', (req, res) => {
    res.json({
      configuredVoiceId: elevenLabsVoiceService.getActiveVoiceId()
    });
  });

  // GOOGLE HOME ECOSYSTEM (PASSIVE DISCOVERY)
  app.get('/api/google-home/ecosystem', async (_req, res) => {
    try {
      const devices = await googleHomeService.getEcosystemSnapshot();
      res.json(Array.isArray(devices) ? devices : []);
    } catch (error) {
      const fallback = googleHomeService.getCachedDevices();
      res.json(Array.isArray(fallback) ? fallback : []);
    }
  });

  app.post('/api/orion/process', async (req, res) => {
    const { prompt } = req.body;
    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
      });
      res.json({ response: result.text });
    } catch (error) {
      console.error('Gemini Error:', error);
      res.status(500).json({ error: 'Gemini processing failed' });
    }
  });

  // --- Voice TTS Endpoint (Backend Proxy for ElevenLabs) ---
  app.post('/api/voice/tts', async (req, res) => {
    const { text, profile, provider, sessionId, requestId, voiceConfig } = req.body;
    const dedupeKey = typeof sessionId === 'string' && sessionId ? sessionId : `anon_${Date.now()}`;
    let released = false;

    const releaseRequest = () => {
      if (released) {
        return;
      }
      released = true;
      activeVoiceRequests.delete(dedupeKey);
    };

    if (!text || text.trim().length === 0) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    console.log(`[TTS_REQUEST] endpoint=/api/voice/tts session=${sessionId || 'none'} request=${requestId || 'none'} profile=${profile || 'none'} provider=${provider || 'elevenlabs'} payload_size=${JSON.stringify(req.body).length} requested_voice_id=${voiceConfig?.voiceId || 'none'}`);

    if (activeVoiceRequests.has(dedupeKey)) {
      console.warn(`[VOICE_REQUEST] duplicate_blocked session=${dedupeKey} request=${requestId || 'none'} active_requests=${activeVoiceRequests.size}`);
      res.status(409).json({ error: 'Duplicate TTS request blocked', sessionId: dedupeKey });
      return;
    }

    if (!elevenLabsVoiceService.isConfigured(voiceConfig?.voiceId)) {
      console.error('[VOICE_503] ElevenLabs not configured on backend');
      res.status(503).json({ error: 'TTS service not configured' });
      return;
    }

    activeVoiceRequests.add(dedupeKey);

    try {
      const result = await elevenLabsVoiceService.synthesize({ text, profile, provider, sessionId, requestId, voiceConfig });
      console.log(`[TTS_RESPONSE] endpoint=/api/voice/tts status=200 session=${sessionId || 'none'} request=${requestId || 'none'} active_requests=${activeVoiceRequests.size} voice_id=${result.voiceId} requested_voice_id=${result.requestedVoiceId} voice_source=${result.voiceSource} validated=${result.voiceValidationState} likely_profile_alias=${String(result.likelyProfileAlias)}`);
      res.set('Content-Type', result.contentType);
      res.set('X-TTS-Provider', 'elevenlabs');
      res.set('X-TTS-Voice-Id', result.voiceId);
      res.set('X-TTS-Requested-Voice-Id', result.requestedVoiceId);
      res.set('X-TTS-Voice-Source', result.voiceSource);
      res.set('X-TTS-Voice-Validated', result.voiceValidationState);
      res.set('X-TTS-Likely-Profile-Alias', String(result.likelyProfileAlias));
      res.set('X-TTS-Model', result.modelId);
      res.set('X-TTS-Output-Format', result.outputFormat);
      result.audioStream.on('data', (chunk: Buffer) => {
        console.log(`[STREAM_RECEIVED] endpoint=/api/voice/tts session=${sessionId || 'none'} request=${requestId || 'none'} bytes=${chunk.length} voice_id=${result.voiceId}`);
      });
      result.audioStream.on('end', () => {
        console.log(`[TTS_STREAM_RUNTIME] endpoint=/api/voice/tts session=${sessionId || 'none'} request=${requestId || 'none'} stream_end=true voice_id=${result.voiceId}`);
      });
      res.on('close', () => {
        result.audioStream.destroy();
        releaseRequest();
      });
      res.on('finish', releaseRequest);
      result.audioStream.on('end', releaseRequest);
      result.audioStream.on('error', (streamErr: any) => {
        console.error(`[PLAYBACK_FAILED] endpoint=/api/voice/tts status=502 session=${sessionId || 'none'} request=${requestId || 'none'} stream_error=${streamErr?.message || streamErr}`);
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.end();
        }
        releaseRequest();
      });
      result.audioStream.pipe(res);
    } catch (err: any) {
      const status = err instanceof ElevenLabsServiceError ? err.statusCode : 502;
      const body = err instanceof ElevenLabsServiceError ? err.responseBody : undefined;
      console.error(`[TTS_RESPONSE] endpoint=/api/voice/tts status=${status} session=${sessionId || 'none'} request=${requestId || 'none'} error=${err.message} requested_voice_id=${voiceConfig?.voiceId || 'none'}`);
      if (status === 503) {
        console.error(`[VOICE_503] endpoint=/api/voice/tts session=${sessionId || 'none'} request=${requestId || 'none'} body=${body || 'none'}`);
      }
      res.status(status).json({ error: `TTS synthesis failed: ${err.message}`, details: body || null });
      releaseRequest();
    }
  });

  // --- TriggerCMD User Bridge API ---
  app.get('/api/triggercmd/config', (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    const config = triggerCmdService.getUserConfig(userId);
    if (!config) {
      res.json({ hasToken: false });
      return;
    }

    res.json(config);
  });

  app.post('/api/triggercmd/config', (req, res) => {
    const { userId, token, endpoint } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    const masked = triggerCmdService.maskToken(token || '');
    triggerCmdService.saveUserConfig(userId, { token, endpoint });

    console.log(`[TRIGGER_AUTH] user bridge loaded userId=${userId} token=${masked} endpoint=${endpoint || 'default'}`);
    res.json({ success: true });
  });

  app.post('/api/triggercmd/sync', async (req, res) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    console.log(`[TRIGGER_SYNC] API /sync called userId=${userId}`);
    const config = triggerCmdService.getUserConfigRaw(userId);
    if (config) {
      console.log(`[TRIGGER_SYNC] API /sync token_present=${!!config.token} token_length=${config.token.length} endpoint=${config.endpoint || '(using env)'}`);
    } else {
      console.log(`[TRIGGER_SYNC] API /sync no config found for userId=${userId}`);
    }

    const result = await triggerCmdService.syncUserDevices(userId);
    console.log(`[TRIGGER_SYNC] API /sync result success=${result.success} count=${result.count} status=${result.status}`);
    res.json(result);
  });

  // --- Socket Logic ---
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.data.userId = null;

    // Initial Status Push
    socket.emit('mqtt:status', { 
      connected: (backendMqttManager as any).connected, 
      timestamp: Date.now() 
    });

    const ecosystemDevices = googleHomeService.getCachedDevices();
    if (Array.isArray(ecosystemDevices) && ecosystemDevices.length > 0) {
      socket.emit('google:device_sync', ecosystemDevices);
    }

    // User auth for socket-scoped triggers
    socket.on('user:auth', ({ userId }) => {
      if (!userId) return;

      console.log(`[TRIGGER_SOCKET] user authenticated room=user:${userId}`);

      socket.data.userId = userId;
      socket.join(`user:${userId}`);

      // Fast path: return cached devices immediately
      const devices = triggerCmdService.getDevicesForUser(userId);
      socket.emit('trigger:devices', devices);
      console.log(`[TRIGGER_HYDRATION] cached_devices count=${devices.length} userId=${userId}`);

      if (triggerCmdService.userHasConfig(userId)) {
        // Slow path: trigger immediate re-sync (will emit updated devices when done)
        console.log(`[TRIGGER_SYNC] reconnect auto-sync starting userId=${userId}`);
        triggerCmdService.syncUserDevices(userId).then((result) => {
          console.log(`[TRIGGER_SYNC] reconnect auto-sync done success=${result.success} count=${result.count} status=${result.status}`);
        }).catch((err) => {
          console.log(`[TRIGGER_SYNC] reconnect auto-sync error=${err}`);
        });
        triggerCmdService.startUserAutoRefresh(userId);
        console.log(`[TRIGGER_AUTH] user bridge loaded userId=${userId}`);
      }
    });

    socket.on('user:logout', () => {
      const prevUserId = socket.data.userId;
      if (prevUserId) {
        socket.leave(`user:${prevUserId}`);
        triggerCmdService.cleanupUserSession(prevUserId);
        socket.data.userId = null;
        console.log(`[TRIGGER_SOCKET] user logged out room=user:${prevUserId}`);
      }
    });

    // --- Distributed Node Logic ---
    socket.on('node:heartbeat', (node) => {
      nodeService.updateNode(node);
      io.emit('node:sync', nodeService.getAllNodes());
    });

    socket.on('sync:event', (data) => {
      socket.broadcast.emit('sync:event', data);
    });

    socket.on('mqtt:publish', ({ topic, message }) => {
      backendMqttManager.publish(topic, message);
    });

    socket.on('trigger:execute', ({ deviceId }, ack?: (response: { success: boolean }) => void) => {
      const userId = socket.data.userId;
      let success = false;

      if (userId && triggerCmdService.userHasConfig(userId)) {
        success = triggerCmdService.executeForUser(userId, deviceId);
      } else {
        success = triggerCmdService.execute(deviceId);
      }

      ack?.({ success });
    });

    const statsInterval = setInterval(() => {
      socket.emit('systemStats', {
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        timestamp: Date.now()
      });
    }, 2000);

    socket.on('disconnect', () => {
      const prevUserId = socket.data.userId;
      if (prevUserId) {
        triggerCmdService.cleanupUserSession(prevUserId);
      }
      clearInterval(statsInterval);
      console.log('[TRIGGER_SOCKET] Client disconnected:', socket.id);
    });
  });

  // Background Node Cleanup
  setInterval(() => {
    nodeService.getAllNodes(); // Triggers internal cleanup
    io.emit('node:sync', nodeService.getAllNodes());
  }, 10000);

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static assets with long-term caching for hashed files
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      immutable: true,
      maxAge: '1y',
      index: false
    }));

    // Serve other static files (like favicon, vite.svg) with shorter cache
    app.use(express.static(distPath, {
      maxAge: '1h',
      index: false
    }));

    app.get('*', (req, res) => {
      // Prevent index.html from being cached to ensure chunk updates are picked up
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`ORION CORE (Hybrid) running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
