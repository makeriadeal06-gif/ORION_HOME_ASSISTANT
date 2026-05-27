import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
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

// Gemini Setup
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

export const app = express();
export const httpServer = createServer(app);
export const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

async function setupApp() {
  console.log('--- ORION CORE SETUP ---');
  console.log('[SERVER] Environment check:', {
    VERCEL: !!process.env.VERCEL,
    ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
    FIREBASE_SERVICE_ACCOUNT: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !!process.env.FIREBASE_SERVICE_ACCOUNT,
    TRIGGERCMD_DEVICES_URL: !!process.env.TRIGGERCMD_DEVICES_URL,
    TRIGGERCMD_EXECUTE_URL: !!process.env.TRIGGERCMD_EXECUTE_URL,
  });
  
  // Initialize Backend Services
  backendMqttManager.init(io);
  triggerCmdService.init(io);
  googleHomeService.init(io);
  elevenLabsVoiceService.startWarmupLoop();

  app.use(cors());
  app.use(express.json());

  // Serve static frontend assets when present (production build output)
  try {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(distDir) && fs.existsSync(indexPath)) {
      console.log('[SERVER] Serving static assets from', distDir);
      // Static assets (will not match /api/*)
      app.use(express.static(distDir));

      // Fallback SPA route — ensure we don't intercept API routes (only serve
      // index.html for non-/api paths so client-side routing works in production).
      app.get(/^\/(?!api\/).*/, (req, res) => {
        res.sendFile(indexPath);
      });
    }
  } catch (err) {
    console.warn('[SERVER] static asset serving disabled, error while enabling:', err);
  }

  // Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
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

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      vercel: !!process.env.VERCEL,
      node: process.version
    });
  });

  app.get('/api/auth/status', (req, res) => res.json(authService.getStatus()));
  app.post('/api/auth/session', (req, res) => {
    authService.setAuthenticated(req.body.isAuthenticated);
    res.json({ success: true });
  });
  app.post('/api/auth/logout', (req, res) => {
    authService.setAuthenticated(false);
    res.json({ success: true });
  });

  app.get('/api/voice/config', (req, res) => {
    try {
      res.json({ configuredVoiceId: elevenLabsVoiceService.getActiveVoiceId() });
    } catch (err) {
      console.error('[API] /api/voice/config failed:', err);
      res.status(500).json({ error: 'voice_config_error' });
    }
  });

  app.get('/api/google-home/ecosystem', async (_req, res) => {
    try {
      const devices = await googleHomeService.getEcosystemSnapshot();
      res.json(Array.isArray(devices) ? devices : []);
    } catch (err) {
      console.error('[API] /api/google-home/ecosystem failed:', err);
      try { res.json(googleHomeService.getCachedDevices()); } catch (_) { res.status(500).json({ error: 'ecosystem_error' }); }
    }
  });

  app.post('/api/orion/process', async (req, res) => {
    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: req.body.prompt,
      });
      res.json({ response: result.text });
    } catch (error) {
      res.status(500).json({ error: 'Gemini processing failed' });
    }
  });

  app.post('/api/voice/tts', async (req, res) => {
    const { text, sessionId, voiceConfig } = req.body;
    if (!text) return res.status(400).json({ error: 'Text required' });
    if (!elevenLabsVoiceService.isConfigured(voiceConfig?.voiceId)) return res.status(503).json({ error: 'TTS not configured' });

    try {
      const result = await elevenLabsVoiceService.synthesize(req.body);
      res.set('Content-Type', result.contentType);
      res.set('X-TTS-Provider', 'elevenlabs');
      result.audioStream.pipe(res);
    } catch (err: any) {
      res.status(err instanceof ElevenLabsServiceError ? err.statusCode : 502).json({ error: err.message });
    }
  });

  app.get('/api/triggercmd/config', (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(triggerCmdService.getUserConfig(userId) || { hasToken: false });
  });

  app.post('/api/triggercmd/config', (req, res) => {
    const { userId, token, endpoint } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    triggerCmdService.saveUserConfig(userId, { token, endpoint });
    res.json({ success: true });
  });

  app.post('/api/triggercmd/sync', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    res.json(await triggerCmdService.syncUserDevices(userId));
  });

  app.post('/api/triggercmd/execute', async (req, res) => {
    const { userId, deviceId } = req.body;
    if (!userId || !deviceId) return res.status(400).json({ error: 'userId and deviceId required' });
    try {
      const ok = triggerCmdService.executeForUser(userId, deviceId);
      res.json({ success: Boolean(ok) });
    } catch (err) {
      res.status(500).json({ error: 'execute_error' });
    }
  });

  // Socket Logic
  io.on('connection', (socket) => {
    socket.emit('mqtt:status', { connected: (backendMqttManager as any).connected, timestamp: Date.now() });
    const devices = googleHomeService.getCachedDevices();
    if (devices.length > 0) socket.emit('google:device_sync', devices);

    socket.on('user:auth', ({ userId }) => {
      if (!userId) return;
      socket.data.userId = userId;
      socket.join(`user:${userId}`);
      socket.emit('trigger:devices', triggerCmdService.getDevicesForUser(userId));
      if (triggerCmdService.userHasConfig(userId)) {
        triggerCmdService.syncUserDevices(userId).catch(() => {});
        triggerCmdService.startUserAutoRefresh(userId);
      }
    });

    socket.on('trigger:execute', ({ deviceId }, ack) => {
      const userId = socket.data.userId;
      const success = userId ? triggerCmdService.executeForUser(userId, deviceId) : triggerCmdService.execute(deviceId);
      ack?.({ success });
    });

    socket.on('disconnect', () => {
      if (socket.data.userId) triggerCmdService.cleanupUserSession(socket.data.userId);
    });
  });
}

// Start sequence
setupApp().catch(err => console.error('Setup failed:', err));

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, () => {
    console.log(`ORION CORE running at http://localhost:${PORT}`);
  });
}

export default app;
