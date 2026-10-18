const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { resolveDesktopDir } = require('./desktop-dir');

// Racine du projet : ce fichier est toujours a la racine
const PROJECT_ROOT = __dirname;
const app = express();
const PORT = process.env.PORT || 3456;
// Le port reellement ecoute peut differer de PORT quand un appelant passe un
// port explicite a startServer. Les reponses d'info doivent le refleter.
let portCourant = null;

// Dossier de depot sur le Bureau, quel que soit l'OS et la langue.
const DROP_DIR_NAME = 'Photos_Transfert';

// Aucun dossier cible tant que startServer n'a pas tourne: le vrai Bureau est
// resolu selon le systeme, jamais suppose a partir du nom anglais "Desktop".
// Deux reperes distincts. La base est le dossier explicitement choisi par
// l'utilisateur (ou le Bureau par defaut). Le dossier courant est celui qui
// recoit les photos. "Creer un dossier" cree toujours un enfant de la base,
// pas du dossier courant: depuis Work1, un nouveau Work2 nait dans Work,
// jamais dans Work1.
let currentTargetDir = null;
let baseTargetDir = null;

function creerDossierSiBesoin(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function setTargetDir(dir, estBase) {
  currentTargetDir = path.resolve(dir);
  creerDossierSiBesoin(currentTargetDir);
  if (estBase) {
    baseTargetDir = currentTargetDir;
  }
  return currentTargetDir;
}

function targetDirParDefaut() {
  return path.join(resolveDesktopDir(), DROP_DIR_NAME);
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

  const portEcoute = portCourant || PORT;
  const mobileUrl = `http://${primary.address}:${portEcoute}/mobile`;
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
    port: portEcoute
  });
});

app.post('/api/config', (req, res) => {
  const { targetDir } = req.body;
  if (targetDir && typeof targetDir === 'string') {
    try {
      // Choix explicite: ce dossier devient la base des creations suivantes.
      setTargetDir(targetDir, true);
      broadcastEvent('config-changed', { targetDir: currentTargetDir });
      return res.json({ success: true, targetDir: currentTargetDir });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
  res.status(400).json({ error: 'Invalid directory path' });
});

// Un nom de dossier n'est jamais un chemin: on retire tout ce qui permettrait
// de sortir du dossier courant ou de forger un separateur de l'autre OS.
function nomDeDossierPropre(nom) {
  if (typeof nom !== 'string') return '';
  // Aucun separateur, aucune ponctuation hostile a un systeme de fichiers,
  // aucun caractere de controle. Le balayage caractere par caractere evite
  // les pieges d'echappement des regex sur Windows.
  let propre = '';
  for (const car of nom) {
    const code = car.codePointAt(0);
    const interdit =
      code < 32 ||
      car === '/' || car === '\\' || car === ':' ||
      car === '*' || car === '?' || car === '"' ||
      car === '<' || car === '>' || car === '|';
    if (!interdit) propre += car;
  }
  propre = propre.trim();
  if (!propre || propre === '.' || propre === '..') return '';
  return propre;
}

// Cree un sous-dossier dans le dossier cible courant et y bascule la
// reception. Le visualiseur cote PC se vide: il ne doit plus montrer les
// vignettes du dossier precedent.
app.post('/api/create-folder', (req, res) => {
  const nom = nomDeDossierPropre(req.body && req.body.name);
  if (!nom) {
    return res.status(400).json({ error: 'Invalid folder name' });
  }
  try {
    // La base (dernier dossier choisi) recoit le nouveau dossier, meme si le
    // dossier courant est deja un sous-dossier cree plus tot. Work1 puis
    // Work2 naissent ainsi tous deux sous Work, jamais l'un dans l'autre.
    // Garde-fou: la cible creee reste un enfant direct de la base, meme si un
    // nom contrefait tentait de remonter dans l'arborescence.
    const racine = path.resolve(baseTargetDir || currentTargetDir);
    const nouvelleCible = path.resolve(racine, nom);
    if (nouvelleCible !== racine && !nouvelleCible.startsWith(racine + path.sep)) {
      return res.status(400).json({ error: 'Folder name escapes the target' });
    }
    setTargetDir(nouvelleCible, false);
    broadcastEvent('config-changed', { targetDir: currentTargetDir });
    return res.json({ success: true, targetDir: currentTargetDir });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

function ouvrirDossier(dossier, fait) {
  const ouvreur =
    process.platform === 'win32'
      ? 'explorer.exe'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  execFile(ouvreur, [dossier], (error) => {
    fait(error || null);
  });
}

app.post('/api/open-folder', (req, res) => {
  if (!currentTargetDir) {
    return res.status(400).json({ error: 'No target directory' });
  }
  ouvrirDossier(currentTargetDir, (error) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  });
});

app.post('/api/upload', upload.array('photos', 100), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  let clientMeta = [];
  try {
    if (req.body && req.body.metadata) {
      clientMeta = JSON.parse(req.body.metadata);
    }
  } catch (err) {}

  const savedFiles = req.files.map((file, idx) => {
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {}

    const meta =
      (Array.isArray(clientMeta) && clientMeta[idx]) ||
      (Array.isArray(clientMeta) && clientMeta.find((m) => m && m.name === file.originalname));
    const dateCaptured = meta && meta.lastModified ? Number(meta.lastModified) : Date.now();

    const fileInfo = {
      filename: file.filename,
      originalName,
      size: file.size,
      mimetype: file.mimetype,
      timestamp: Date.now(),
      dateCaptured
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

function startServer(port, options) {
  return new Promise((resolve, reject) => {
    const p = port || PORT;
    portCourant = p;
    const conf = options || {};
    // L'app Electron fournit son vrai Bureau (app.getPath('desktop')). Sans
    // lui, le serveur standalone resout le Bureau selon l'OS et la langue.
    // Le dossier initial est aussi la base des creations a venir.
    setTargetDir(conf.targetDir ? conf.targetDir : targetDirParDefaut(), true);
    const server = app.listen(p, '0.0.0.0', () => {
      const interfaces = getNetworkInterfaces();
      const primary = interfaces[0] ? interfaces[0].address : '127.0.0.1';
      console.log(`PhotoDrop server listening on port ${p}`);
      console.log(`Local PC: http://localhost:${p}`);
      console.log(`Mobile:   http://${primary}:${p}/mobile`);
      console.log(`Destination folder: ${currentTargetDir}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, app, DROP_DIR_NAME };
