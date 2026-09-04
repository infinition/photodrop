import { i18n } from './i18n.js';

let currentInfo = null;
const receivedPhotos = [];

const qrImage = document.getElementById('qrImage');
const interfaceSelect = document.getElementById('interfaceSelect');
const directUrlText = document.getElementById('directUrlText');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const folderPathDisplay = document.getElementById('folderPathDisplay');
const openFolderBtn = document.getElementById('openFolderBtn');
const transfersGrid = document.getElementById('transfersGrid');
const emptyState = document.getElementById('emptyState');
const transfersCount = document.getElementById('transfersCount');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const langSelect = document.getElementById('langSelect');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');

function showToast(msg) {
  toastMessage.textContent = msg;
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
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.debug('Audio cue skipped:', err);
  }
}

async function loadServerInfo(selectedIp) {
  const url = selectedIp ? `/api/info?ip=${encodeURIComponent(selectedIp)}` : '/api/info';
  const response = await fetch(url);
  currentInfo = await response.json();

  qrImage.src = currentInfo.qrCode;
  directUrlText.textContent = currentInfo.mobileUrl;
  folderPathDisplay.textContent = currentInfo.targetDir;

  interfaceSelect.innerHTML = '';
  currentInfo.allInterfaces.forEach((iface) => {
    const opt = document.createElement('option');
    opt.value = iface.address;
    opt.textContent = `${iface.name} (${iface.address})`;
    if (iface.address === currentInfo.selectedIp) {
      opt.selected = true;
    }
    interfaceSelect.appendChild(opt);
  });
}

function renderReceivedPhoto(photo) {
  if (emptyState) {
    emptyState.style.display = 'none';
  }

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
    thumbWrap.appendChild(img);
  } else {
    thumbWrap.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="23 7 16 12 23 17 23 7"></polygon>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
      </svg>
    `;
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
  timeEl.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  metaEl.appendChild(sizeEl);
  metaEl.appendChild(timeEl);

  info.appendChild(nameEl);
  info.appendChild(metaEl);

  card.appendChild(thumbWrap);
  card.appendChild(info);

  transfersGrid.insertBefore(card, transfersGrid.firstChild);
  updateStats();
}

function updateStats() {
  const count = receivedPhotos.length;
  transfersCount.textContent = i18n.t('pc.fileCount', { count });
}

function setupSse() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('photo-received', (event) => {
    try {
      const photo = JSON.parse(event.data);
      receivedPhotos.unshift(photo);
      renderReceivedPhoto(photo);
      playArrivalChime();
      showToast(`${photo.originalName} recu`);
    } catch (err) {
      console.error('Error parsing photo event:', err);
    }
  });

  eventSource.addEventListener('config-changed', (event) => {
    try {
      const data = JSON.parse(event.data);
      folderPathDisplay.textContent = data.targetDir;
    } catch (err) {
      console.error('Error parsing config event:', err);
    }
  });

  eventSource.onerror = () => {
    console.debug('SSE connection issue, retrying in 3s...');
  };
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

  interfaceSelect.addEventListener('change', (e) => {
    loadServerInfo(e.target.value);
  });

  copyUrlBtn.addEventListener('click', async () => {
    if (currentInfo && currentInfo.mobileUrl) {
      await navigator.clipboard.writeText(currentInfo.mobileUrl);
      showToast(i18n.t('pc.urlCopied'));
    }
  });

  openFolderBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(i18n.t('pc.openedInExplorer'));
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  });

  clearHistoryBtn.addEventListener('click', () => {
    receivedPhotos.length = 0;
    transfersGrid.innerHTML = '';
    if (emptyState) {
      transfersGrid.appendChild(emptyState);
      emptyState.style.display = 'flex';
    }
    updateStats();
  });

  window.addEventListener('localeChanged', () => {
    updateStats();
  });
}

init();
