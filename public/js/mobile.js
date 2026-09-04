import { i18n } from './i18n.js';

let selectedFiles = [];
let isUploading = false;

const galleryInput = document.getElementById('galleryInput');
const cameraInput = document.getElementById('cameraInput');
const photoGrid = document.getElementById('photoGrid');
const emptyPrompt = document.getElementById('emptyPrompt');
const selectionToolbar = document.getElementById('selectionToolbar');
const selectedSummary = document.getElementById('selectedSummary');
const toggleAllBtn = document.getElementById('toggleAllBtn');
const bottomBar = document.getElementById('bottomBar');
const uploadBtn = document.getElementById('uploadBtn');
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressPercent = document.getElementById('progressPercent');
const pickerView = document.getElementById('pickerView');
const successView = document.getElementById('successView');
const successDesc = document.getElementById('successDesc');
const uploadMoreBtn = document.getElementById('uploadMoreBtn');
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

function handleFilesAdded(fileList) {
  if (!fileList || fileList.length === 0) return;

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const id = `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const previewUrl = URL.createObjectURL(file);

    selectedFiles.push({
      id,
      file,
      url: previewUrl,
      selected: true
    });
  }

  galleryInput.value = '';
  cameraInput.value = '';

  renderGrid();
}

function removeFile(id) {
  const index = selectedFiles.findIndex((item) => item.id === id);
  if (index !== -1) {
    URL.revokeObjectURL(selectedFiles[index].url);
    selectedFiles.splice(index, 1);
    renderGrid();
  }
}

function toggleFileSelection(id) {
  const item = selectedFiles.find((i) => i.id === id);
  if (item) {
    item.selected = !item.selected;
    renderGrid();
  }
}

function renderGrid() {
  photoGrid.innerHTML = '';

  if (selectedFiles.length === 0) {
    emptyPrompt.style.display = 'flex';
    selectionToolbar.style.display = 'none';
    bottomBar.style.display = 'none';
    return;
  }

  emptyPrompt.style.display = 'none';
  selectionToolbar.style.display = 'flex';
  bottomBar.style.display = 'flex';

  selectedFiles.forEach((item) => {
    const card = document.createElement('div');
    card.className = `grid-card ${item.selected ? 'selected' : 'deselected'}`;

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.file.name;
    img.loading = 'lazy';

    const overlay = document.createElement('div');
    overlay.className = 'grid-card-overlay';
    overlay.addEventListener('click', () => toggleFileSelection(item.id));

    const check = document.createElement('div');
    check.className = 'grid-card-check';
    check.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'grid-card-remove';
    removeBtn.type = 'button';
    removeBtn.title = i18n.t('mobile.removePhoto');
    removeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFile(item.id);
    });

    const sizeBadge = document.createElement('span');
    sizeBadge.className = 'grid-card-size';
    sizeBadge.textContent = i18n.formatFileSize(item.file.size);

    card.appendChild(img);
    card.appendChild(overlay);
    card.appendChild(check);
    card.appendChild(removeBtn);
    card.appendChild(sizeBadge);

    photoGrid.appendChild(card);
  });

  updateToolbar();
}

function updateToolbar() {
  const selectedCount = selectedFiles.filter((i) => i.selected).length;
  const totalSize = selectedFiles
    .filter((i) => i.selected)
    .reduce((acc, curr) => acc + curr.file.size, 0);

  selectedSummary.textContent = i18n.t('mobile.selectedSummary', {
    count: selectedCount,
    size: i18n.formatFileSize(totalSize)
  });

  const allSelected = selectedFiles.length > 0 && selectedCount === selectedFiles.length;
  toggleAllBtn.textContent = allSelected ? i18n.t('mobile.deselectAll') : i18n.t('mobile.selectAll');

  uploadBtn.disabled = selectedCount === 0 || isUploading;
}

function startUpload() {
  const itemsToUpload = selectedFiles.filter((i) => i.selected);
  if (itemsToUpload.length === 0) {
    showToast(i18n.t('mobile.errorEmpty'));
    return;
  }

  isUploading = true;
  uploadBtn.disabled = true;
  uploadProgressWrap.classList.add('active');
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';

  const formData = new FormData();
  itemsToUpload.forEach((item) => {
    formData.append('photos', item.file, item.file.name);
  });

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload', true);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      progressFill.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressText.textContent = i18n.t('mobile.uploadProgress', {
        current: Math.min(Math.ceil((e.loaded / e.total) * itemsToUpload.length), itemsToUpload.length),
        total: itemsToUpload.length,
        percent
      });
    }
  };

  xhr.onload = () => {
    isUploading = false;
    uploadProgressWrap.classList.remove('active');

    if (xhr.status >= 200 && xhr.status < 300) {
      const response = JSON.parse(xhr.responseText);
      const uploadedCount = response.count || itemsToUpload.length;

      successDesc.textContent = i18n.t('mobile.uploadSuccessDesc', { count: uploadedCount });
      pickerView.style.display = 'none';
      bottomBar.style.display = 'none';
      successView.classList.add('active');

      selectedFiles.forEach((item) => URL.revokeObjectURL(item.url));
      selectedFiles = [];
    } else {
      uploadBtn.disabled = false;
      showToast(i18n.t('mobile.errorNetwork'));
    }
  };

  xhr.onerror = () => {
    isUploading = false;
    uploadBtn.disabled = false;
    uploadProgressWrap.classList.remove('active');
    showToast(i18n.t('mobile.errorNetwork'));
  };

  xhr.send(formData);
}

function resetToPicker() {
  successView.classList.remove('active');
  pickerView.style.display = 'block';
  renderGrid();
}

async function init() {
  await i18n.init();
  langSelect.value = i18n.currentLocale;

  langSelect.addEventListener('change', async (e) => {
    await i18n.setLocale(e.target.value);
    updateToolbar();
  });

  galleryInput.addEventListener('change', (e) => handleFilesAdded(e.target.files));
  cameraInput.addEventListener('change', (e) => handleFilesAdded(e.target.files));

  toggleAllBtn.addEventListener('click', () => {
    const allSelected = selectedFiles.every((i) => i.selected);
    selectedFiles.forEach((i) => (i.selected = !allSelected));
    renderGrid();
  });

  uploadBtn.addEventListener('click', startUpload);
  uploadMoreBtn.addEventListener('click', resetToPicker);

  window.addEventListener('localeChanged', () => {
    updateToolbar();
  });
}

init();
