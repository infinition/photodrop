import { i18n } from './i18n.js';

// Visionneuse plein ecran cote PC. Double clic sur une vignette, puis:
// zoom a la molette ou aux boutons, deplacement a la souris quand on est
// agrandi, photo precedente et suivante au boutons ou aux fleches, fermeture
// a Echap. Les vignettes et les photos viennent du dossier cible courant.

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const PAS_ZOOM = 1.25;

const viewer = document.getElementById('viewer');
const stage = document.getElementById('viewerStage');
const imgEl = document.getElementById('viewerImg');
const videoEl = document.getElementById('viewerVideo');
const fallbackEl = document.getElementById('viewerFallback');
const countEl = document.getElementById('viewerCount');
const nameEl = document.getElementById('viewerName');
const zoomLabel = document.getElementById('viewerZoomLabel');
const btnPrev = document.getElementById('viewerPrev');
const btnNext = document.getElementById('viewerNext');
const btnClose = document.getElementById('viewerClose');
const btnZoomIn = document.getElementById('viewerZoomIn');
const btnZoomOut = document.getElementById('viewerZoomOut');
const btnReset = document.getElementById('viewerZoomReset');

const state = {
  ouvert: false,
  photos: [],
  courante: null,
  echelle: 1,
  decalX: 0,
  decalY: 0,
  baseW: 0,
  baseH: 0,
  enGlisse: false
};

function urlApercu(photo) {
  return `/api/preview/${encodeURIComponent(photo.filename)}`;
}

function estImage(photo) {
  if (photo.mimetype) {
    return photo.mimetype.startsWith('image/');
  }
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|tiff?)$/i.test(photo.originalName || '');
}

function estVideo(photo) {
  if (photo.mimetype) {
    return photo.mimetype.startsWith('video/');
  }
  return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(photo.originalName || '');
}

function positionCourante() {
  return state.photos.indexOf(state.courante);
}

function afficherMedia() {
  const image = estImage(state.courante);
  const video = estVideo(state.courante);

  imgEl.style.display = image ? '' : 'none';
  videoEl.style.display = video ? '' : 'none';
  fallbackEl.hidden = image || video;

  if (image) {
    imgEl.src = urlApercu(state.courante);
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  } else if (video) {
    videoEl.src = urlApercu(state.courante);
    imgEl.removeAttribute('src');
    fallbackEl.textContent = '';
  } else {
    imgEl.removeAttribute('src');
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    fallbackEl.textContent = i18n.t('viewer.unsupported');
  }
}

function recentrer() {
  const echelle = state.echelle;
  const baseW = state.baseW || 1;
  const baseH = state.baseH || 1;
  const largeurReelle = baseW * echelle;
  const hauteurReelle = baseH * echelle;
  const margeX = Math.max(0, (largeurReelle - stage.clientWidth) / 2);
  const margeY = Math.max(0, (hauteurReelle - stage.clientHeight) / 2);
  state.decalX = Math.min(Math.max(state.decalX, -margeX), margeX);
  state.decalY = Math.min(Math.max(state.decalY, -margeY), margeY);
}

function appliquerTransform() {
  if (!state.courante) return;
  recentrer();
  const support = estVideo(state.courante) ? videoEl : imgEl;
  const enZoom = state.echelle > 1.001;
  if (support === imgEl) {
    support.classList.toggle('zoom-actif', enZoom);
  }
  support.style.transform =
    `translate(calc(-50% + ${state.decalX}px), calc(-50% + ${state.decalY}px)) scale(${state.echelle})`;
  zoomLabel.textContent = `${Math.round(state.echelle * 100)}%`;
  btnZoomOut.disabled = state.echelle <= MIN_SCALE + 0.001;
  btnReset.disabled = state.echelle <= MIN_SCALE + 0.001 && state.decalX === 0 && state.decalY === 0;
}

function mesurer() {
  const support = estVideo(state.courante) ? videoEl : imgEl;
  if (support.offsetWidth > 0) {
    state.baseW = support.offsetWidth;
    state.baseH = support.offsetHeight;
  }
}

function reglerZoom(echelle) {
  state.echelle = Math.min(MAX_SCALE, Math.max(MIN_SCALE, echelle));
  appliquerTransform();
}

function zoomerDepuisMolette(delta) {
  const facteur = delta < 0 ? PAS_ZOOM : 1 / PAS_ZOOM;
  reglerZoom(state.echelle * facteur);
}

function ouvrir(photos, index) {
  if (!photos || photos.length === 0) return;
  state.photos = photos;
  state.courante = photos[index] || photos[0];
  state.echelle = 1;
  state.decalX = 0;
  state.decalY = 0;
  state.baseW = 0;
  state.baseH = 0;
  afficherMedia();
  rafraichirMeta();
  viewer.hidden = false;
  state.ouvert = true;
  appliquerTransform();
  const support = estImage(state.courante) ? imgEl : videoEl;
  if (estVideo(state.courante)) {
    const reprendre = () => {
      mesurer();
      appliquerTransform();
    };
    videoEl.addEventListener('loadedmetadata', reprendre, { once: true });
  } else {
    imgEl.addEventListener('load', () => {
      mesurer();
      appliquerTransform();
    }, { once: true });
  }
}

function fermer() {
  state.ouvert = false;
  state.courante = null;
  viewer.hidden = true;
  imgEl.removeAttribute('src');
  videoEl.pause();
  videoEl.removeAttribute('src');
  videoEl.load();
  fallbackEl.textContent = '';
}

function rafraichirMeta() {
  const total = state.photos.length;
  const position = positionCourante() + 1;
  countEl.textContent = `${position} / ${total}`;
  nameEl.textContent = state.courante.originalName || state.courante.filename;
  nameEl.title = nameEl.textContent;
  btnPrev.disabled = position <= 1;
  btnNext.disabled = position >= total;
}

function naviguer(direction) {
  const index = positionCourante() + direction;
  if (index < 0 || index >= state.photos.length) return;
  state.courante = state.photos[index];
  state.echelle = 1;
  state.decalX = 0;
  state.decalY = 0;
  state.baseW = 0;
  state.baseH = 0;
  afficherMedia();
  rafraichirMeta();
  appliquerTransform();
  if (estImage(state.courante)) {
    imgEl.addEventListener('load', () => {
      mesurer();
      appliquerTransform();
    }, { once: true });
  } else if (estVideo(state.courante)) {
    videoEl.addEventListener('loadedmetadata', () => {
      mesurer();
      appliquerTransform();
    }, { once: true });
  }
}

// Deplacement a la souris ou au doigt quand l'image est agrandie.
stage.addEventListener('pointerdown', (e) => {
  if (!state.ouvert || state.echelle <= 1.001) return;
  state.enGlisse = true;
  stage.setPointerCapture(e.pointerId);
  state.debutX = e.clientX;
  state.debutY = e.clientY;
  state.origineX = state.decalX;
  state.origineY = state.decalY;
  imgEl.classList.add('drag-en-cours');
});

stage.addEventListener('pointermove', (e) => {
  if (!state.enGlisse) return;
  state.decalX = state.origineX + (e.clientX - state.debutX);
  state.decalY = state.origineY + (e.clientY - state.debutY);
  appliquerTransform();
});

function finGlisse() {
  state.enGlisse = false;
  imgEl.classList.remove('drag-en-cours');
}

stage.addEventListener('pointerup', finGlisse);
stage.addEventListener('pointercancel', finGlisse);

stage.addEventListener('wheel', (e) => {
  if (!state.ouvert) return;
  e.preventDefault();
  zoomerDepuisMolette(e.deltaY);
}, { passive: false });

imgEl.addEventListener('dblclick', (e) => {
  if (!state.ouvert) return;
  e.preventDefault();
  if (state.echelle > 1.001) {
    reglerZoom(1);
  } else {
    reglerZoom(2.5);
  }
});

btnPrev.addEventListener('click', () => naviguer(-1));
btnNext.addEventListener('click', () => naviguer(1));
btnClose.addEventListener('click', fermer);
btnZoomIn.addEventListener('click', () => reglerZoom(state.echelle * PAS_ZOOM));
btnZoomOut.addEventListener('click', () => reglerZoom(state.echelle / PAS_ZOOM));
btnReset.addEventListener('click', () => {
  state.echelle = 1;
  state.decalX = 0;
  state.decalY = 0;
  appliquerTransform();
});

window.addEventListener('keydown', (e) => {
  if (!state.ouvert) return;
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    naviguer(-1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    naviguer(1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    fermer();
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    reglerZoom(state.echelle * PAS_ZOOM);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    reglerZoom(state.echelle / PAS_ZOOM);
  } else if (e.key === '0') {
    e.preventDefault();
    state.echelle = 1;
    state.decalX = 0;
    state.decalY = 0;
    appliquerTransform();
  }
});

export const visionneuse = { ouvrir, fermer };
