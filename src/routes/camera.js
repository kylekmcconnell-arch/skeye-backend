/**
 * Skeye.AI - Camera Proxy Routes
 * ================================
 * Proxies requests from the frontend to the Pi's stream server.
 * This keeps the Pi's URL hidden from the client and handles CORS cleanly.
 * 
 * The Pi stream URL is set via CAMERA_STREAM_URL env var.
 * Example: CAMERA_STREAM_URL=https://cam.skeye.ai (Cloudflare Tunnel)
 *      or: CAMERA_STREAM_URL=http://192.168.1.50:5000 (local network)
 */

const express = require('express');
const router = express.Router();
const http = require('http');
const https = require('https');

// Camera stream server URL — set this in your .env
const CAMERA_URL = process.env.CAMERA_STREAM_URL || 'http://localhost:5000';

/**
 * Helper: proxy a POST request to the Pi
 */
async function proxyPost(piPath, body) {
  const url = new URL(piPath, CAMERA_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 5000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

/**
 * Helper: proxy a GET request to the Pi
 */
async function proxyGet(piPath) {
  const url = new URL(piPath, CAMERA_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      timeout: 5000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

// ─── Stream proxy (MJPEG passthrough) ───
router.get('/stream', (req, res) => {
  const url = new URL('/stream', CAMERA_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'GET',
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Stream proxy error:', err.message);
    res.status(502).json({ error: 'Camera stream unavailable', details: err.message });
  });

  req.on('close', () => proxyReq.destroy());
  proxyReq.end();
});

// ─── Snapshot proxy ───
router.get('/snapshot', (req, res) => {
  const url = new URL('/snapshot', CAMERA_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'GET',
    timeout: 5000,
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-cache',
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    res.status(502).json({ error: 'Snapshot unavailable' });
  });

  proxyReq.end();
});

// ─── Camera status ───
router.get('/status', async (req, res) => {
  try {
    const result = await proxyGet('/api/status');
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Camera offline', details: err.message });
  }
});

// ─── PTZ control ───
router.post('/ptz', async (req, res) => {
  try {
    const result = await proxyPost('/api/ptz', req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Camera offline', details: err.message });
  }
});

// ─── Zoom control ───
router.post('/zoom', async (req, res) => {
  try {
    const result = await proxyPost('/api/zoom', req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Camera offline', details: err.message });
  }
});

// ─── Focus control ───
router.post('/focus', async (req, res) => {
  try {
    const result = await proxyPost('/api/focus', req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Camera offline', details: err.message });
  }
});

// ─── Night vision ───
router.post('/nightvision', async (req, res) => {
  try {
    const result = await proxyPost('/api/nightvision', req.body);
    res.status(result.status).json(result.data);
  } catch (err) {
    res.status(502).json({ error: 'Camera offline', details: err.message });
  }
});

// ─── Health check ───
router.get('/health', async (req, res) => {
  try {
    const result = await proxyGet('/api/health');
    res.json({ backend: 'ok', camera: result.data });
  } catch (err) {
    res.json({ backend: 'ok', camera: { status: 'offline', error: err.message } });
  }
});

module.exports = router;
