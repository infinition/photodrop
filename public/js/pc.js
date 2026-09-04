import { i18n } from './i18n.js';
import { visionneuse } from './viewer.js';

let currentInfo = null;
let currentTargetDir = '';
const receivedPhotos = [];

const qrImage = document.getElementById('qrImage');
const interfaceSelect = document.getElementById('interfaceSelect');
const directUrlText = document.getElementById('directUrlText');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const folderPathDisplay = document.getElementById('folderPathDisplay');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const createFolderBtn = document.getElementById('createFolderBtn');
const newFolderName = document.getElementById('newFolderName');
const openFolderBtn = document.getElementById('openFolderBtn');
const transfersGrid = document.getElementById('transfersGrid');
const emptyState = document.getElementById('emptyState');
const transfersCount = document.getElementById('transfersCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const langSelect = document.getElementById('langSelect');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

const isElectron = typeof window.electronAPI !== 'undefined';

// Titlebar controls (Electron only)
const titlebarControls = document.getElementById('titlebarControls');
const btnMinimize = document.getElementById('btnMinimize');
const btnMaximize = document.getElementById('btnMaximize');
const btnClose = document.getElementById('btnClose');

function showToast(msg, error = false) {
  toastMessage.textContent = msg;
  toast.style.borderColor = error ? 'var(--accent-rose)' : 'var(--accent-orange)';
  toast.querySelector('svg').style.stroke = error ? 'var(--accent-rose)' : 'var(--accent-orange)';
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function playArrivalChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (err) {
    console.debug('Audio cue skipped:', err);
  }
}

async function loadServerInfo(selectedIp) {
  const url = selectedIp ? `/api/info?ip=${encodeURIComponent(selectedIp)}` : '/api/info';
  const response = await fetch(url);
  currentInfo = await response.json();
  currentTargetDir = currentInfo.targetDir;

  qrImage.src = currentInfo.qrCode;
  directUrlText.textContent = currentInfo.mobileUrl;
  folderPathDisplay.textContent = currentInfo.targetDir;

  interfaceSelect.innerHTML = '';
  currentInfo.allInterfaces.forEach((iface) => {
    const opt = document.createElement('option');
    opt.value = iface.address;
    opt.textContent = `${iface.name} (${iface.address})`;
    if (iface.address === currentInfo.selectedIp) opt.selected = true;
    interfaceSelect.appendChild(opt);
  });
}

// Change la cible affichee et vide le visualiseur: ses vignettes viennent du
// dossier precedent et ne correspondent plus au dossier dans lequel les
// prochaines photos seront deversees.
function afficherDossierActif(p) {
  currentTargetDir = p;
  folderPathDisplay.textContent = p;
  clearGallery();
}

async function changerDossier(folderPath) {
  if (!folderPath) return;
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: folderPath })
    });
    const data = await res.json();
    if (data.success) {
      afficherDossierActif(data.targetDir);
      showToast(i18n.t('pc.targetChanged', { path: data.targetDir }));
    } else {
      showToast(data.error || i18n.t('pc.networkError'), true);
    }
  } catch (err) {
    showToast(i18n.t('pc.networkError'), true);
  }
}

// Le nom reste un nom: la creation se fait cote serveur, qui connait le vrai
// chemin du dossier courant et les separateurs de l'OS.
async function creerSousDossier(name) {
  if (!name) {
    showToast(i18n.t('pc.nameRequired'), true);
    return;
  }
  try {
    const res = await fetch('/api/create-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success) {
      afficherDossierActif(data.targetDir);
      showToast(i18n.t('pc.folderCreated', { name }));
    } else {
      showToast(data.error || i18n.t('pc.networkError'), true);
    }
  } catch (err) {
    showToast(i18n.t('pc.networkError'), true);
  }
}

function renderReceivedPhoto(photo) {
  if (emptyState) emptyState.style.display = 'none';

  const card = document.createElement('div');
  card.className = 'transfer-item';

  const previewUrl = `/api/preview/${encodeURIComponent(photo.filename)}`;
  const thumbWrap = document.createElement('div');
  thumbWrap.className = 'transfer-thumb-wrap';

  const isImage = photo.mimetype ? photo.mimetype.startsWith('image/') : true;
  if (isImage) {
    const img = document.createElement('img');
    img.className = 'transfer-thumb';
    img.src = previewUrl;
    img.alt = photo.originalName;
    img.loading = 'lazy';
    img.draggable = false;
    thumbWrap.appendChild(img);
  } else {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('class', 'transfer-thumb-icon');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.5');
    icon.innerHTML = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>';
    thumbWrap.appendChild(icon);
  }

  const info = document.createElement('div');
  info.className = 'transfer-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'transfer-name';
  nameEl.textContent = photo.originalName;
  nameEl.title = photo.originalName;

  const metaEl = document.createElement('div');
  metaEl.className = 'transfer-meta';

  const sizeEl = document.createElement('span');
  sizeEl.textContent = i18n.formatFileSize(photo.size);

  const timeEl = document.createElement('span');
  const d = new Date(photo.timestamp);
  timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  metaEl.appendChild(sizeEl);
  metaEl.appendChild(timeEl);
  info.appendChild(nameEl);
  info.appendChild(metaEl);
  card.appendChild(thumbWrap);
  card.appendChild(info);

  // Double clic sur une vignette: la photo s'ouvre en grand dans la
  // visionneuse, avec zoom, precedente et suivante, clavier directionnel.
  card.addEventListener('dblclick', (e) => {
    e.preventDefault();
    const index = receivedPhotos.indexOf(photo);
    if (index !== -1) {
      visionneuse.ouvrir(receivedPhotos, index);
    }
  });

  transfersGrid.insertBefore(card, transfersGrid.firstChild);
  updateStats();
}

function updateStats() {
  transfersCount.textContent = `${receivedPhotos.length}`;
}

function clearGallery() {
  receivedPhotos.length = 0;
  const items = transfersGrid.querySelectorAll('.transfer-item');
  items.forEach(el => el.remove());
  if (emptyState) {
    emptyState.style.display = 'flex';
  }
  updateStats();
}

function setupSse() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('photo-received', (event) => {
    try {
      const photo = JSON.parse(event.data);
      receivedPhotos.unshift(photo);
      renderReceivedPhoto(photo);
      playArrivalChime();
      showToast(`${photo.originalName}`);
    } catch (err) {
      console.error('Error parsing photo event:', err);
    }
  });

  eventSource.addEventListener('config-changed', (event) => {
    try {
      const data = JSON.parse(event.data);
      afficherDossierActif(data.targetDir);
    } catch (err) {}
  });

  eventSource.onerror = () => {
    console.debug('SSE reconnecting...');
  };
}

function setupTitlebar() {
  if (!isElectron) return;
  titlebarControls.style.display = 'flex';

  btnMinimize.addEventListener('click', () => window.electronAPI.minimize());
  btnMaximize.addEventListener('click', () => window.electronAPI.maximize());
  btnClose.addEventListener('click', () => window.electronAPI.close());

  window.electronAPI.onWindowStateChanged((state) => {
    const icon = document.getElementById('maximizeIcon');
    if (state.maximized) {
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.innerHTML = '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M8 5V3h13v13h-2"/>';
    } else {
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/>';
    }
  });
}

async function init() {
  await i18n.init();
  langSelect.value = i18n.currentLocale;

  langSelect.addEventListener('change', async (e) => {
    await i18n.setLocale(e.target.value);
    updateStats();
  });

  await loadServerInfo();
  setupSse();
  setupTitlebar();

  interfaceSelect.addEventListener('change', (e) => {
    loadServerInfo(e.target.value);
  });

  copyUrlBtn.addEventListener('click', async () => {
    if (currentInfo && currentInfo.mobileUrl) {
      await navigator.clipboard.writeText(currentInfo.mobileUrl);
      showToast(i18n.t('pc.urlCopied'));
    }
  });

  // Choisir un dossier existant
  pickFolderBtn.addEventListener('click', async () => {
    if (isElectron) {
      const folder = await window.electronAPI.pickFolder();
      if (folder) await changerDossier(folder);
    } else {
      const chemin = prompt(i18n.t('pc.pickPrompt'));
      if (chemin) await changerDossier(chemin);
    }
  });

  // Creer un sous-dossier dans le dossier cible courant, puis basculer dessus
  createFolderBtn.addEventListener('click', async () => {
    const name = newFolderName.value.trim();
    newFolderName.value = '';
    await creerSousDossier(name);
  });

  // Ouvrir dans Explorateur
  openFolderBtn.addEventListener('click', async () => {
    if (isElectron) {
      await window.electronAPI.openExplorer(currentTargetDir);
    } else {
      try {
        const res = await fetch('/api/open-folder', { method: 'POST' });
        const data = await res.json();
        if (data.success) showToast(i18n.t('pc.openedInExplorer'));
      } catch (err) {
        console.error('Failed to open folder:', err);
      }
    }
  });

  // Clear
  clearHistoryBtn.addEventListener('click', clearGallery);

  window.addEventListener('localeChanged', () => {
    updateStats();
  });
}

init();
