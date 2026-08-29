import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import morgan from 'morgan';
import { initializeTools, toolRegistry } from './tools/index.js';
import { agentLoop } from './agent/agentLoop.js';
import { safetyManager } from './safety/permissions.js';
import { ollamaClient } from './router/ollamaClient.js';
import { modelRouter } from './router/modelRouter.js';
import { brain } from './router/brain.js';
import { geminiClient } from './router/geminiClient.js';
import { elevenLabsService } from './tts/elevenLabs.js';
import { validateString, LIMITS } from './utils/apiGuard.js';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// 1. Initialize Tools
initializeTools();

// 2. Setup Express & HTTP Server
const app = express();

// Request logging for developer diagnostics
app.use(morgan('dev'));

// Security headers (relaxed CSP so the dev server's HMR/sockets keep working)
app.use(
  helmet({
    contentSecurityPolicy: false, // dev server injects its own script tags
    crossOriginEmbedderPolicy: false,
  })
);

// Limit JSON body size — prevents OOM via huge payloads
app.use(express.json({ limit: '1mb' }));

// Enable CORS for Vite dev server and configured frontend ports
const allowedOrigins = [
  `http://localhost:${process.env.VITE_PORT || 3000}`,
  `http://127.0.0.1:${process.env.VITE_PORT || 3000}`,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or in allowed list
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly fallback
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
    credentials: true,
  })
);

// Global rate limiter: 200 req / minute / IP for all /api endpoints (defense-in-depth)
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' },
});

// Per-route stricter limits
const agentRunLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many agent tasks. Slow down.' },
});

const ttsLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many TTS requests.' },
});

const ttsVoicesLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests.' },
});

// REST Health & Discovery Endpoints
app.get('/api/health', globalLimiter, async (_req, res) => {
  const brainHealth = await brain.checkHealth();
  const ollamaOnline = brainHealth.provider === 'ollama'
    ? brainHealth.online
    : await ollamaClient.checkHealth();
  res.json({
    status: 'online',
    version: '0.5.0',
    toolsCount: toolRegistry.getAll().length,
    brain: brainHealth,
    geminiConfigured: geminiClient.isConfigured(),
    ollamaConnected: ollamaOnline,
    modelConfig: modelRouter.getConfig(),
    activeClients: clients.size,
  });
});

app.get('/api/tools', globalLimiter, (_req, res) => {
  res.json({
    tools: toolRegistry.getAll().map(t => ({
      name: t.name,
      category: t.category,
      description: t.description,
      dangerLevel: t.dangerLevel,
      parameters: t.parameters,
    })),
  });
});

app.post('/api/agent/run', globalLimiter, agentRunLimiter, async (req, res) => {
  const promptCheck = validateString(req.body?.prompt, 'prompt', {
    required: true,
    minLength: 1,
    maxLength: LIMITS.MAX_PROMPT_LENGTH,
  });
  if (!promptCheck.ok) return res.status(400).json({ error: promptCheck.error });

  // Guard against prompt injection at the API boundary
  const inputCheck = safetyManager.validateUserInput(promptCheck.value!);
  if (!inputCheck.allowed) {
    console.warn(`[Safety] Rejected suspicious input: ${inputCheck.reason}`);
    return res.status(400).json({ error: 'Input rejected by safety filter.', reason: inputCheck.reason });
  }

  agentLoop.runTask(promptCheck.value!).catch(err => {
    console.error('[Server API] Background task error:', err);
  });

  res.json({ message: 'Task dispatched to agent loop', prompt: promptCheck.value });
});

app.post('/api/tts', globalLimiter, ttsLimiter, async (req, res) => {
  const textCheck = validateString(req.body?.text, 'text', {
    required: true,
    minLength: 1,
    maxLength: LIMITS.MAX_TTS_LENGTH,
  });
  if (!textCheck.ok) return res.status(400).json({ error: textCheck.error });

  const voiceCheck = validateString(req.body?.voiceId, 'voiceId', {
    maxLength: LIMITS.MAX_VOICE_ID_LENGTH,
  });
  if (!voiceCheck.ok) return res.status(400).json({ error: voiceCheck.error });

  if (!elevenLabsService.isConfigured()) {
    return res.status(503).json({
      error: 'ElevenLabs API key not configured. Set ELEVENLABS_API_KEY in .env',
    });
  }

  try {
    const audioBuffer = await elevenLabsService.synthesize({
      text: textCheck.value!,
      voiceId: voiceCheck.value,
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    return res.end(audioBuffer);
  } catch (err: any) {
    console.error('[TTS API Error]:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/tts/voices', globalLimiter, ttsVoicesLimiter, async (_req, res) => {
  try {
    const voices = await elevenLabsService.listVoices();
    res.json({ voices });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const httpServer = createServer(app);

// 3. Setup WebSocket Server
const wss = new WebSocketServer({ server: httpServer, maxPayload: 256 * 1024 });
const clients = new Set<WebSocket>();

function broadcast(message: any): void {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Hook safety manager to WebSocket
safetyManager.setBroadcaster(broadcast);

// Hook agent events to WebSocket broadcast
agentLoop.addListener((event) => {
  broadcast({ type: 'AGENT_EVENT', event });
});

// Per-connection rate limiter for WebSocket START_TASK
const wsTaskTimestamps = new WeakMap<WebSocket, number[]>();
const WS_TASK_MAX = 10;
const WS_TASK_WINDOW_MS = 60_000;

wss.on('connection', (ws, _req) => {
  clients.add(ws);
  wsTaskTimestamps.set(ws, []);
  console.log(`[WebSocket] Client connected. Total active clients: ${clients.size}`);

  // Send initial connection state
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    payload: {
      toolsCount: toolRegistry.getAll().length,
      activeTask: agentLoop.getActiveTask(),
      pendingConfirmations: safetyManager.getPendingRequests(),
    },
  }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // ── Client requests task execution ──
      if (msg.type === 'START_TASK' && msg.prompt) {
        // Validate + rate-limit per-connection
        const promptCheck = validateString(msg.prompt, 'prompt', {
          required: true,
          maxLength: LIMITS.MAX_PROMPT_LENGTH,
        });
        if (!promptCheck.ok) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { error: promptCheck.error } }));
          return;
        }

        const now = Date.now();
        const ts = (wsTaskTimestamps.get(ws) || []).filter(t => now - t < WS_TASK_WINDOW_MS);
        if (ts.length >= WS_TASK_MAX) {
          ws.send(JSON.stringify({ type: 'ERROR', payload: { error: 'WebSocket task rate limit exceeded' } }));
          wsTaskTimestamps.set(ws, ts);
          return;
        }
        ts.push(now);
        wsTaskTimestamps.set(ws, ts);

        console.log(`[WebSocket] Received directive: "${promptCheck.value}"`);

        const inputCheck = safetyManager.validateUserInput(promptCheck.value!);
        if (!inputCheck.allowed) {
          console.warn(`[Safety] WebSocket rejected suspicious input: ${inputCheck.reason}`);
          ws.send(JSON.stringify({
            type: 'ERROR',
            payload: { error: 'Input rejected by safety filter.', reason: inputCheck.reason },
          }));
          return;
        }

        agentLoop.runTask(promptCheck.value!);
      }

      // ── Client responds to safety confirmation ──
      if (msg.type === 'CONFIRMATION_RESPONSE' && msg.requestId) {
        const approved = Boolean(msg.approved);
        console.log(`[Safety] User confirmation response for ${msg.requestId}: ${approved ? 'APPROVED' : 'REJECTED'}`);
        safetyManager.handleUserResponse(msg.requestId, approved);
      }
    } catch (err: any) {
      console.error('[WebSocket] Message handling error:', err.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WebSocket] Client disconnected. Total active clients: ${clients.size}`);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// 4. Graceful shutdown — close server + sockets cleanly on SIGTERM/SIGINT
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[Server] Received ${signal}. Closing connections...`);

  for (const client of clients) {
    try { client.close(1001, 'Server shutting down'); } catch {}
  }

  wss.close(() => {
    httpServer.close(() => {
      console.log('[Server] Shutdown complete.');
      process.exit(0);
    });
  });

  // Force exit after 5s if graceful shutdown stalls
  setTimeout(() => {
    console.warn('[Server] Forced exit after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// 5. Start Listening
httpServer.listen(PORT, () => {
  console.log(`\n========================================================`);
  console.log(`⚡ JARVIS Computer Use Backend Server Online`);
  console.log(`📡 HTTP Endpoint:      http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Gateway:  ws://localhost:${PORT}`);
  console.log(`🛠️  Registered Tools:   ${toolRegistry.getAll().length} OS & Browser tools`);
  console.log(`🧠 AI Brain:           ${brain.getProvider()} / ${brain.getModelName()}`);
  console.log(`========================================================\n`);
});
