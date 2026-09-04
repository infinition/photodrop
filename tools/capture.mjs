// Capture une page PhotoDrop en PNG via Chrome headless et le protocole CDP.
//
// Electron affichait des boites d'erreur sur le bureau de l'utilisateur, donc
// la capture des captures d'ecran du README passe par Chrome sans interface.
// Le flux SSE exige que la page reste ouverte pendant l'envoi des fichiers,
// c'est pourquoi on pilote Chrome a distance plutot que d'utiliser l'option
// --screenshot (qui capture trop tot, vignettes vides).
//
// Usage:
//   node tools/capture.mjs <url> <fichier.png> \
//       [--width 1320] [--height 820] [--scale 2] [--wait 1800] [--lang fr] \
//       [--upload a.jpg b.jpg ...] [--pick a.jpg b.jpg ...]
//
// --upload envoie les fichiers a l'API apres connexion SSE de la page (vue PC).
// --pick  injecte les fichiers dans le champ galerie mobile (vue smartphone,
//         grille de selection remplie comme si l'utilisateur les avait choisis).
import { spawn } from 'node:child_process';
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHEMINS_CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);

function trouverChrome() {
  for (const candidat of CHEMINS_CHROME) {
    if (existsSync(candidat)) return candidat;
  }
  throw new Error('Chrome introuvable. Reglez CHROME_PATH.');
}

function analyserArgs(argv) {
  const opts = {
    width: 1320,
    height: 820,
    scale: 2,
    wait: 1800,
    lang: 'fr',
    upload: [],
    pick: []
  };
  const positionnels = [];
  let collecteur = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--upload' || arg === '--pick') {
      collecteur = arg;
      continue;
    }
    if (arg.startsWith('--')) {
      const cle = arg.slice(2).split('=')[0];
      const valeur = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      collecteur = null;
      if (cle === 'upload' || cle === 'pick') opts[cle].push(valeur);
      else if (cle === 'lang') opts.lang = String(valeur);
      else if (['width', 'height', 'scale', 'wait'].includes(cle)) opts[cle] = Number(valeur);
      continue;
    }
    if (collecteur === '--upload') opts.upload.push(arg);
    else if (collecteur === '--pick') opts.pick.push(arg);
    else positionnels.push(arg);
  }
  opts.url = positionnels[0];
  opts.sortie = positionnels[1];
  return opts;
}

function attendre(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function demarrerChrome(opts) {
  const chrome = trouverChrome();
  const profil = mkdtempSync(path.join(os.tmpdir(), 'photodrop-cap-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--disable-background-networking',
    '--remote-allow-origins=*',
    `--user-data-dir=${profil}`,
    '--remote-debugging-port=0',
    'about:blank'
  ];
  const enfant = spawn(chrome, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  enfant.stderr.on('data', () => {});
  return { enfant, profil };
}

async function attendrePort(profil, delaiMax = 15000) {
  const fichierPort = path.join(profil, 'DevToolsActivePort');
  const debut = Date.now();
  while (Date.now() - debut < delaiMax) {
    if (existsSync(fichierPort)) {
      try {
        const [port] = readFileSync(fichierPort, 'utf8').trim().split(/\s+/);
        return Number(port);
      } catch (err) {}
    }
    await attendre(120);
  }
  throw new Error('Chrome headless ne demarre pas (pas de port DevTools).');
}

class SessionCdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.enAttente = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (err) {
        return;
      }
      if (msg.id && this.enAttente.has(msg.id)) {
        const { resolve, reject } = this.enAttente.get(msg.id);
        this.enAttente.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  envoyer(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.enAttente.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function ouvrirSession(urlBase) {
  const reponse = await fetch(`${urlBase}/json/list`);
  const cibles = await reponse.json();
  const page = cibles.find((c) => c.type === 'page');
  if (!page) throw new Error('Aucune cible page dans Chrome.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', () => rej(new Error('Connexion CDP refusee.')));
  });
  return new SessionCdp(ws);
}

async function evaluer(session, expression) {
  const resultat = await session.envoyer('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (resultat.exceptionDetails) {
    throw new Error('Echec evaluate: ' + JSON.stringify(resultat.exceptionDetails));
  }
  return resultat.result ? resultat.result.value : undefined;
}

async function attendreCondition(session, expression, delaiMax = 15000, pas = 200) {
  const debut = Date.now();
  while (Date.now() - debut < delaiMax) {
    let valeur;
    try {
      valeur = await evaluer(session, expression);
    } catch (err) {
      valeur = false;
    }
    if (valeur) return valeur;
    await attendre(pas);
  }
  throw new Error('Condition non atteinte: ' + expression);
}

async function naviguer(session, url, langue) {
  await session.envoyer('Page.enable');
  await session.envoyer('Runtime.enable');
  await session.envoyer('Page.navigate', { url });
  await attendreCondition(session, 'document.readyState === "complete"', 20000);
  // Force la langue voulue puis recharge, comme un reglage utilisateur.
  await evaluer(session, `localStorage.setItem('photodrop_lang', '${langue}')`);
  await session.envoyer('Page.navigate', { url });
  await attendreCondition(session, 'document.readyState === "complete"', 20000);
  await attendreCondition(
    session,
    `document.documentElement.lang === '${langue}'`,
    15000
  );
}

async function attendreImages(session, selecteur, min, delaiMax = 15000) {
  await evaluer(
    session,
    `document.querySelectorAll('${selecteur}').forEach((i) => { i.loading = 'eager'; i.decode && i.decode().catch(() => {}); }); true`
  );
  const debut = Date.now();
  while (Date.now() - debut < delaiMax) {
    const pret = await evaluer(
      session,
      `(() => {
        const is = [...document.querySelectorAll('${selecteur}')];
        return is.length >= ${min} && is.every((i) => i.complete && i.naturalWidth > 0);
      })()`
    );
    if (pret) return;
    await attendre(300);
  }
  throw new Error('Images non decodees: ' + selecteur);
}

async function envoyerVersApi(origin, fichiers) {
  const corps = new FormData();
  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier);
    const nom = path.basename(fichier);
    const type = nom.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    corps.append('photos', new Blob([contenu], { type }), nom);
  }
  const reponse = await fetch(origin + '/api/upload', { method: 'POST', body: corps });
  if (!reponse.ok) throw new Error('Upload API: HTTP ' + reponse.status);
}

async function injecterDansGaleries(session, fichiers) {
  const morceaux = [];
  for (const fichier of fichiers) {
    const contenu = readFileSync(fichier).toString('base64');
    morceaux.push(
      JSON.stringify({
        nom: path.basename(fichier),
        b64: contenu,
        type: 'image/jpeg'
      })
    );
  }
  const liste = '[' + morceaux.join(',') + ']';
  const expression = `
    (async () => {
      const fichiersInjectes = ${liste};
      const construits = fichiersInjectes.map((f) => {
        const octets = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
        return new File([octets], f.nom, { type: f.type });
      });
      const transfert = new DataTransfer();
      construits.forEach((f) => transfert.items.add(f));
      const entree = document.getElementById('galleryInput');
      entree.files = transfert.files;
      entree.dispatchEvent(new Event('change', { bubbles: true }));
      return construits.length;
    })()
  `;
  await evaluer(session, expression);
}

async function nettoyer(enfant, profil, session) {
  try {
    if (session) session.ws.close();
  } catch (err) {}
  try {
    enfant.kill();
  } catch (err) {}
  await attendre(300);
  try {
    rmSync(profil, { recursive: true, force: true });
  } catch (err) {}
}

async function main() {
  const opts = analyserArgs(process.argv.slice(2));
  if (!opts.url || !opts.sortie) {
    console.error('Usage: node tools/capture.mjs <url> <sortie.png> [options]');
    process.exit(1);
  }

  const { enfant, profil } = demarrerChrome(opts);
  let session = null;
  try {
    const port = await attendrePort(profil);
    const urlBase = `http://127.0.0.1:${port}`;
    session = await ouvrirSession(urlBase);
    await session.envoyer('Emulation.setDeviceMetricsOverride', {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: opts.scale,
      mobile: opts.width < 800
    });

    await naviguer(session, opts.url, opts.lang);
    const origin = new URL(opts.url).origin;

    if (opts.upload.length > 0) {
      // Le visualiseur PC reçoit les vignettes par SSE. Le serveur diffuse
      // l'evenement photo-received vers la page ouverte: on envoie apres la
      // connexion pour que les vignettes apparaissent. L'affichage du chemin
      // du dossier courant confirme que l'interface a fini de s'initialiser.
      await attendreCondition(
        session,
        `(document.querySelector('#folderPathDisplay') || { textContent: '' }).textContent.length > 3`,
        10000,
        200
      );
      await attendre(600);
      await envoyerVersApi(origin, opts.upload);
      await attendreCondition(
        session,
        `document.querySelectorAll('.transfer-item').length >= ${opts.upload.length}`,
        15000,
        300
      );
      await attendreImages(session, 'img.transfer-thumb', opts.upload.length);
    }

    if (opts.pick.length > 0) {
      await attendre(500);
      await injecterDansGaleries(session, opts.pick);
      await attendreCondition(
        session,
        `document.querySelectorAll('#photoGrid img').length >= ${opts.pick.length}`,
        15000,
        300
      );
      await attendreImages(session, '#photoGrid img', opts.pick.length);
    }

    // Laisse les vignettes se charger et les toasts disparaitre.
    await attendre(opts.wait);
    await evaluer(
      session,
      `document.querySelectorAll('img.transfer-thumb').forEach((i) => { i.loading = 'eager'; });`
    );
    await attendre(900);

    const resultat = await session.envoyer('Page.captureScreenshot', { format: 'png' });
    writeFileSync(opts.sortie, Buffer.from(resultat.data, 'base64'));
    console.log('Capture ecrite:', opts.sortie, opts.width + 'x' + opts.height);
  } finally {
    await nettoyer(enfant, profil, session);
  }
}

main().catch((err) => {
  console.error('Erreur:', err.message);
  process.exit(1);
});
