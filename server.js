const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Racine du projet : ce fichier est toujours a la racine
const PROJECT_ROOT = __dirname;
const app = express();
const PORT = process.env.PORT || 3456;

const defaultTargetDir = path.join(os.homedir(), 'Desktop', 'Photos_Transfert');
let currentTargetDir = defaultTargetDir;

if (!fs.existsSync(currentTargetDir)) {
  fs.mkdirSync(currentTargetDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self';"
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

function getNetworkInterfaces() {
  const nets = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    const isVirtual = /vEthernet|WSL|VirtualBox|VMware|Loopback|docker|Hyper-V/i.test(name);
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const isLan = net.address.startsWith('192.168.') || net.address.startsWith('10.');
        results.push({
          name,
          address: net.address,
          isVirtual,
          priority: isLan && !isVirtual ? 1 : isVirtual ? 3 : 2
        });
      }
    }
  }

  results.sort((a, b) => a.priority - b.priority);
  return results;
}

function getSafeFilename(dir, originalName) {
  let cleanName;
  try {
    cleanName = Buffer.from(originalName, 'latin1').toString('utf8');
  } catch (e) {
    cleanName = originalName;
  }
  cleanName = cleanName.replace(/[<>:"/\\|?*]+/g, '_').trim();
  if (!cleanName) {
    cleanName = `photo_${Date.now()}.jpg`;
  }

  const ext = path.extname(cleanName);
  const base = path.basename(cleanName, ext);

  let targetPath = path.join(dir, cleanName);
  let counter = 1;

  while (fs.existsSync(targetPath)) {
    targetPath = path.join(dir, `${base} (${counter})${ext}`);
    counter++;
  }

  return path.basename(targetPath);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(currentTargetDir)) {
      fs.mkdirSync(currentTargetDir, { recursive: true });
    }
    cb(null, currentTargetDir);
  },
  filename: (req, file, cb) => {
    const finalName = getSafeFilename(currentTargetDir, file.originalname);
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

const sseClients = new Set();

function broadcastEvent(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  res.write('event: connected\ndata: {"status":"ok"}\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write('event: ping\ndata: {}\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

app.get('/api/info', async (req, res) => {
  const interfaces = getNetworkInterfaces();
  const requestedIp = req.query.ip;
  const primary = interfaces.find((i) => i.address === requestedIp) || interfaces[0] || {
    name: 'localhost',
    address: '127.0.0.1'
  };

  const mobileUrl = `http://${primary.address}:${PORT}/mobile`;
  let qrCodeData = '';

  try {
    qrCodeData = await QRCode.toDataURL(mobileUrl, {
      margin: 1,
      width: 340,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
  }

  res.json({
    selectedIp: primary.address,
    selectedInterface: primary.name,
    allInterfaces: interfaces,
    mobileUrl,
    qrCode: qrCodeData,
    targetDir: currentTargetDir,
    port: PORT
  });
});

app.post('/api/config', (req, res) => {
  const { targetDir } = req.body;
  if (targetDir && typeof targetDir === 'string') {
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      currentTargetDir = path.resolve(targetDir);
      broadcastEvent('config-changed', { targetDir: currentTargetDir });
      return res.json({ success: true, targetDir: currentTargetDir });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  res.status(400).json({ error: 'Invalid directory path' });
});

app.post('/api/open-folder', (req, res) => {
  if (process.platform === 'win32') {
    exec(`explorer.exe "${currentTargetDir}"`, (error) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true });
    });
  } else {
    res.json({ success: false, message: 'Platform not supported for explorer.exe' });
  }
});

app.post('/api/upload', upload.array('photos', 100), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const savedFiles = req.files.map((file) => {
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    const fileInfo = {
      filename: file.filename,
      originalName,
      size: file.size,
      mimetype: file.mimetype,
      timestamp: Date.now()
    };
    broadcastEvent('photo-received', fileInfo);
    return fileInfo;
  });

  res.json({
    success: true,
    count: savedFiles.length,
    files: savedFiles
  });
});

app.get('/api/preview/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(currentTargetDir, filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

const publicDir = path.join(PROJECT_ROOT, 'public');
const localesDir = path.join(PROJECT_ROOT, 'locales');

app.use('/locales', express.static(localesDir));
app.use(express.static(publicDir));

app.get('/mobile', (req, res) => {
  res.sendFile(path.join(publicDir, 'mobile.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

function startServer(port) {
  return new Promise((resolve, reject) => {
    const p = port || PORT;
    const server = app.listen(p, '0.0.0.0', () => {
      const interfaces = getNetworkInterfaces();
      const primary = interfaces[0] ? interfaces[0].address : '127.0.0.1';
      console.log(`PhotoDrop server listening on port ${p}`);
      console.log(`Local PC: http://localhost:${p}`);
      console.log(`Mobile:   http://${primary}:${p}/mobile`);
      console.log(`Desktop folder: ${currentTargetDir}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, app };
