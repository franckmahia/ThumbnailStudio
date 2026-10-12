import { PALETTES, imagePrompt, renderThumbnail, suggestHeadlines } from './engine.mjs';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const paths = {
  sparkles: '<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z"/><path d="m20 2 .8 1.8L23 5l-2.2.8L20 8l-.8-2.2L17 5l2.2-1.2z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/>',
  settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sliders: '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4m-5 0h10"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
};
for (const node of $$('[data-icon]')) node.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[node.dataset.icon] || ''}</svg>`;

let db;
let current;
let selected = 0;
let loadedImage = null;
let isBusy = false;
let saveTimer;
let toastTimer;
let videoURL;
let renderVersion = 0;
let status = { codex: { installed: false, connected: false }, configured: false };
let saveQueue = Promise.resolve();
let activeReview = null;
let reviewProject = null;
let reviewPixels = null;
let publishing = false;
let connectionSeen = false;

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.remove('hidden');
  toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4500);
}
function showError(error) {
  $('#error-message').textContent = error.message || String(error);
  $('#error-banner').classList.remove('hidden');
}
$('#dismiss-error').onclick = () => $('#error-banner').classList.add('hidden');
function openDialog(id) { $(id).showModal(); }
$$('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog && event.offsetX < 0) dialog.close(); }));

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('thumbnail-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('La bibliothèque locale est indisponible. Les exports restent possibles.'));
  });
}
function database(operation, mode = 'readonly') {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Le stockage local est indisponible. Exporte ton projet pour le conserver.'));
    const transaction = db.transaction('projects', mode);
    const request = operation(transaction.objectStore('projects'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(new Error('Enregistrement impossible. Le stockage du navigateur est peut-être plein. Sauvegarde le projet JSON.'));
    transaction.onabort = transaction.onerror;
  });
}
async function refreshCount() {
  if (!db) return;
  const count = await database(store => store.count());
  $('#project-count').textContent = count;
  $('#library-total').textContent = `${count} projet${count > 1 ? 's' : ''}`;
}
function persist() {
  clearTimeout(saveTimer);
  current.updatedAt = new Date().toISOString();
  const snapshot = structuredClone(current);
  $('#save-status').textContent = 'Enregistrement…';
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    await database(store => store.put(snapshot), 'readwrite');
    localStorage.setItem('thumbnail-current-project', snapshot.id);
    if (current.id === snapshot.id) $('#save-status').textContent = '✓ Enregistré ici';
    await refreshCount();
  });
  saveQueue.catch(error => { $('#save-status').textContent = 'Non enregistré'; showError(error); });
  return saveQueue;
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 450); }

function makeProject(example = false) {
  const title = example ? 'L’IA en entreprise : de la démo au terrain' : '';
  return {
    version: 1, id: crypto.randomUUID(), title,
    description: example ? 'Comment transformer une idée IA en outil vraiment utile au quotidien.' : '',
    style: 'editorial', signature: '', eyebrow: example ? 'DU PROTOTYPE AU TERRAIN' : 'UNE AUTRE PERSPECTIVE',
    image: example ? '/example.png' : '', source: example ? 'example' : 'local',
    variants: (example ? ['L’IA,\nMAIS UTILE.', 'DE LA DÉMO\nAU TERRAIN.', 'L’IA DANS\nLA VRAIE VIE.'] : ['TON IDÉE.\nTON IMAGE.', 'UNE AUTRE\nPERSPECTIVE.', 'À TOI\nDE CRÉER.']).map((headline, i) => ({ headline, palette: ['violet', 'mint', 'peach'][i] })),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

async function loadImage(source) {
  if (!source) return null;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossible de lire cette image. Essaie un fichier PNG, JPG ou WebP.'));
    image.src = source;
  });
}

function renderCanvases() {
  renderThumbnail($('#main-canvas'), current, selected, loadedImage);
  $$('#variants canvas').forEach((canvas, index) => renderThumbnail(canvas, current, index, loadedImage));
  const labels = { example: 'Visuel d’exemple · Codex', codex: 'Image générée avec Codex', api: 'Image générée par API', upload: 'Image importée', video: 'Image de ta vidéo', local: 'Composition locale' };
  $('#source-label').textContent = labels[current.source] || 'Composition locale';
  syncYouTubeUI();
  $('#remove-image').classList.toggle('hidden', !current.image);
  $('#media-label').textContent = current.image && current.source !== 'example' ? 'Visuel importé · remplacer' : 'Dépose une image ou une vidéo';
}

function renderVariants() {
  const parent = $('#variants'); parent.replaceChildren();
  ['L’essentiel', 'Un autre angle', 'La perspective'].forEach((label, index) => {
    const button = document.createElement('button');
    button.className = `variant${index === selected ? ' selected' : ''}`;
    button.type = 'button'; button.setAttribute('aria-label', `Sélectionner la variante ${index + 1} : ${label}`);
    button.setAttribute('aria-pressed', index === selected);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    const footer = document.createElement('div'); footer.className = 'variant-footer';
    const text = document.createElement('b'); text.textContent = `${String(index + 1).padStart(2, '0')} · ${label}`;
    footer.append(text);
    if (index === selected) { const check = document.createElement('span'); check.className = 'picked'; check.textContent = '✓'; button.append(check); }
    button.append(canvas, footer);
    button.onclick = () => { selected = index; renderVariants(); syncEditor(); renderCanvases(); };
    parent.append(button);
  });
}
function syncEditor() {
  $('#headline').value = current.variants[selected].headline;
  $('#signature').value = current.signature;
  $('#eyebrow').value = current.eyebrow;
  $('#variant-label').textContent = `Variante ${String(selected + 1).padStart(2, '0')}`;
  $('#palettes').replaceChildren();
  for (const [key, palette] of Object.entries(PALETTES)) {
    const button = document.createElement('button'); button.className = `palette${current.variants[selected].palette === key ? ' selected' : ''}`;
    button.style.background = palette.accent; button.type = 'button';
    button.setAttribute('aria-label', `Palette ${palette.name}`); button.title = palette.name;
    button.setAttribute('aria-pressed', current.variants[selected].palette === key);
    button.onclick = () => { current.variants[selected].palette = key; syncEditor(); renderCanvases(); scheduleSave(); };
    $('#palettes').append(button);
  }
}
async function displayProject(project) {
  current = project; selected = 0;
  $('#video-title').value = project.title;
  $('#description').value = project.description;
  $$('.style-card').forEach(button => { const chosen = button.dataset.style === project.style; button.classList.toggle('selected', chosen); button.setAttribute('aria-pressed', chosen); });
  $('#generation-headline').value = project.generationHeadline || '';
  $('#portrait-confirmed').checked = project.referenceConfirmed === true;
  renderVariants(); syncEditor();
  const token = ++renderVersion;
  loadedImage = null;
  renderCanvases();
  try { const image = await loadImage(project.image); if (token === renderVersion) { loadedImage = image; renderCanvases(); } }
  catch (error) { showError(error); }
}
function updateBrief() {
  current.title = $('#video-title').value.trim();
  current.description = $('#description').value.trim();
}
async function navigate(view) {
  $$('.view').forEach(section => section.classList.toggle('hidden', section.id !== `${view}-view`));
  $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#breadcrumb-current').textContent = { studio: 'Créer une miniature', library: 'Ma bibliothèque', guide: 'Le petit guide' }[view];
  history.replaceState(null, '', `#${view}`);
  if (view === 'library') await renderLibrary();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
$$('[data-view]').forEach(button => button.onclick = () => navigate(button.dataset.view).catch(showError));
$('.brand').onclick = event => { event.preventDefault(); navigate('studio'); };
async function newProject() {
  if (isBusy) { toast('Attends la fin de la génération avant de changer de projet.'); return; }
  if (saveTimer) await persist().catch(() => {});
  await displayProject(makeProject());
  $('#save-status').textContent = 'Nouveau projet';
  navigate('studio'); $('#video-title').focus();
}
$('#new-project').onclick = newProject;
$('#library-new').onclick = newProject;
$('#help-button').onclick = $('#show-inspiration').onclick = () => navigate('guide');

async function refreshStatus() {
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Studio local indisponible. Vérifie que server.py est démarré.');
    status = await response.json();
    $('#settings-api-status').textContent = status.codex.connected ? '✓ Codex connecté avec ChatGPT · prêt à générer' : status.codex.installed ? 'Codex installé · connexion ChatGPT requise' : 'Codex CLI à installer';
    $('#auth-button').textContent = status.codex.connected ? 'Reconnecter mon compte ChatGPT' : 'Connecter mon compte ChatGPT';
    syncConnectionUI();
  } catch (error) { showError(error); }
}
$('#auth-button').onclick = async () => {
  try {
    const response = await fetch('/api/auth/login', { method: 'POST' });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    toast('La connexion officielle Codex s’ouvre dans ton navigateur.');
    $('#auth-button').disabled = true;
    const deadline = Date.now() + 185000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 3000)); await refreshStatus();
      if (status.codex.connected) { toast('Compte ChatGPT connecté. Ton studio est prêt.'); break; }
    }
  } catch (error) { showError(error); }
  finally { $('#auth-button').disabled = false; }
};

function setBusy(busy) {
  isBusy = busy;
  document.body.classList.toggle('busy', busy);
  $$('#brief-form button, #brief-form textarea, #brief-form input, #new-project, #library-new, #api-button, #remove-image, .style-card, #youtube-import-form input, #youtube-import-form button').forEach(node => node.disabled = busy);
  $('#generate-button').textContent = busy ? 'Codex imagine ton visuel…' : (current.youtube ? '✦ Générer avec mon visage ↗' : '✦ Générer mes 3 variantes ↗');
  $('#save-status').textContent = busy ? 'Génération en cours…' : '✓ Enregistré ici';
  syncYouTubeUI();
}
async function pollJob(identifier, projectId) {
  setBusy(true);
  try {
    for (let attempt = 0; attempt < 170; attempt++) {
      const response = await fetch(`/api/jobs/${encodeURIComponent(identifier)}`);
      const result = await response.json();
      if (!response.ok || result.status === 'error') throw new Error(result.error || 'La génération a échoué.');
      if (result.status === 'done') {
        if (current.id !== projectId) throw new Error('Le projet courant a changé pendant la génération.');
        const image = await loadImage(result.image);
        current.image = result.image; current.source = 'codex'; current.renderMode = result.renderMode || 'overlay'; loadedImage = image;
        renderCanvases(); await persist(); toast(current.renderMode === 'complete' ? 'Ta miniature est prête. Vérifie-la avant de la valider.' : 'Ton image est prête. Trois compositions, à toi de choisir.');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error('Le délai de génération est dépassé. Vérifie Codex avant de relancer.');
  } finally { localStorage.removeItem('thumbnail-pending'); setBusy(false); }
}
$('#brief-form').onsubmit = async event => {
  event.preventDefault();
  if (isBusy || !$('#brief-form').reportValidity()) return;
  updateBrief();
  if (!current.title) { $('#video-title').focus(); return; }
  if (current.youtube && (!current.portrait || !current.referenceConfirmed)) { showError(new Error('Vérifie ton portrait et coche la confirmation avant de générer.')); return; }
  current.variants = suggestHeadlines(current.title).map((headline, i) => ({ headline, palette: current.variants[i].palette }));
  renderVariants(); syncEditor(); renderCanvases();
  try {
    await persist();
    await refreshStatus();
    if (!status.codex.connected) { openDialog('#settings-dialog'); toast('Connecte Codex à ton compte ChatGPT pour générer.'); return; }
    const response = await fetch('/api/codex/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: current.title, description: current.description, style: current.style, ...(current.youtube ? { reference: current.portrait, referenceConfirmed: current.referenceConfirmed, complete: true, headline: current.generationHeadline || '' } : {}) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    localStorage.setItem('thumbnail-pending', JSON.stringify({ job: result.job, project: current.id }));
    await pollJob(result.job, current.id);
  } catch (error) { showError(error); }
};
$('#compose-only').onclick = async () => {
  if (!$('#brief-form').reportValidity()) return;
  updateBrief();
  current.renderMode = 'overlay';
  current.variants = suggestHeadlines(current.title).map((headline, i) => ({ headline, palette: current.variants[i].palette }));
  renderVariants(); syncEditor(); renderCanvases();
  await persist().catch(showError); toast('Trois compositions prêtes, avec ton visuel actuel.');
};
$$('.style-card').forEach(button => button.onclick = () => {
  current.style = button.dataset.style;
  $$('.style-card').forEach(item => { const chosen = item === button; item.classList.toggle('selected', chosen); item.setAttribute('aria-pressed', chosen); });
  renderCanvases(); scheduleSave();
});
$('#video-title').oninput = () => { updateBrief(); scheduleSave(); };
$('#description').oninput = () => { updateBrief(); scheduleSave(); };
$('#headline').oninput = () => { current.variants[selected].headline = $('#headline').value; renderCanvases(); scheduleSave(); };
$('#signature').oninput = () => { current.signature = $('#signature').value; renderCanvases(); scheduleSave(); };
$('#eyebrow').oninput = () => { current.eyebrow = $('#eyebrow').value; renderCanvases(); scheduleSave(); };

async function useImage(source, origin) {
  const image = await loadImage(source);
  if (image.width * image.height > 60000000) throw new Error('Image trop grande. Réduis-la avant de l’importer.');
  // Store a display-quality local copy, rather than an oversized source photograph.
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  current.image = canvas.toDataURL('image/jpeg', 0.92); current.source = origin; current.renderMode = 'overlay';
  loadedImage = await loadImage(current.image);
  renderCanvases(); await persist(); toast('Visuel ajouté aux trois variantes.');
}
async function importMedia(file) {
  if (!file || isBusy) return;
  if (file.type.startsWith('video/')) {
    if (file.size > 300 * 1024 * 1024) throw new Error('Choisis une vidéo de moins de 300 Mo pour ce studio local.');
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    const video = $('#source-video'); video.src = videoURL;
    video.onloadedmetadata = () => { if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration * 0.35, 20); };
    video.onerror = () => showError(new Error('Ce format vidéo n’est pas lisible dans ton navigateur. Essaie MP4 H.264.'));
    openDialog('#video-dialog'); return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choisis une image PNG, JPG ou WebP, ou une vidéo MP4.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choisis une image de moins de 20 Mo.');
  const source = URL.createObjectURL(file);
  try { await useImage(source, 'upload'); } finally { URL.revokeObjectURL(source); }
}
$('#media-input').onchange = event => importMedia(event.target.files[0]).catch(showError).finally(() => { event.target.value = ''; });
$('#media-input').addEventListener('focus', () => $('#upload-zone').classList.add('dragging'));
$('#media-input').addEventListener('blur', () => $('#upload-zone').classList.remove('dragging'));
const drop = $('#upload-zone');
drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); importMedia(event.dataTransfer.files[0]).catch(showError); });
$('#capture-frame').onclick = async () => {
  try {
    const video = $('#source-video');
    if (video.readyState < 2) throw new Error('Attends le chargement de la vidéo.');
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    await useImage(canvas.toDataURL('image/jpeg', 0.92), 'video'); $('#video-dialog').close();
  } catch (error) { showError(error); }
};
$('#video-dialog').addEventListener('close', () => $('#source-video').pause());
$('#remove-image').onclick = () => { current.image = ''; current.source = 'local'; loadedImage = null; renderCanvases(); scheduleSave(); };

function promptDialog() { updateBrief(); $('#image-prompt').value = imagePrompt(current); openDialog('#prompt-dialog'); }
$('#prompt-button').onclick = $('#guide-prompt').onclick = promptDialog;
$('#copy-prompt').onclick = async () => {
  try { await navigator.clipboard.writeText($('#image-prompt').value); toast('Prompt copié. À toi de jouer dans ChatGPT.'); }
  catch { $('#image-prompt').select(); toast('Sélectionne et copie le prompt avec ⌘C ou Ctrl+C.'); }
};
function preview() {
  renderThumbnail($('#youtube-canvas'), current, selected, loadedImage);
  $('#youtube-title').textContent = current.title || 'Le titre de ta prochaine vidéo';
  $('#youtube-channel').textContent = current.signature || 'Ta chaîne'; openDialog('#preview-dialog');
}
$('#preview-button').onclick = $('#guide-preview').onclick = preview;
function download(blob, filename) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function asBlob(canvas, type, quality) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('L’export a échoué.')), type, quality)); }
$('#export-button').onclick = async () => {
  try {
    const canvas = renderThumbnail(document.createElement('canvas'), current, selected, loadedImage);
    let type = $('#export-format').value === 'jpeg' ? 'image/jpeg' : 'image/png';
    let blob = await asBlob(canvas, type, 0.92);
    if (blob.size > 2 * 1024 * 1024) {
      type = 'image/jpeg';
      for (const quality of [0.9, 0.8, 0.65, 0.5]) { blob = await asBlob(canvas, type, quality); if (blob.size <= 2 * 1024 * 1024) break; }
      toast('Export JPG optimisé pour rester sous 2 Mo.');
    }
    if (blob.size > 2 * 1024 * 1024) throw new Error('Le fichier reste trop volumineux. Essaie un visuel plus simple.');
    const slug = (current.title || 'miniature').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 70).toLowerCase();
    download(blob, `${slug}-v${selected + 1}.${type === 'image/png' ? 'png' : 'jpg'}`);
    if (db) await persist();
  } catch (error) { showError(error); }
};
$('#settings-button').onclick = () => { refreshStatus(); openDialog('#settings-dialog'); };
$('#backup-project').onclick = async () => {
  try {
    const backup = structuredClone(current);
    if (backup.image === '/example.png') {
      const response = await fetch('/example.png'); const blob = await response.blob();
      backup.image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    }
    download(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }), `thumbnail-projet-${current.id.slice(0, 8)}.json`);
    toast('Sauvegarde du projet téléchargée.');
  } catch (error) { showError(error); }
};
function validateProject(project) {
  if (!project || project.version !== 1 || typeof project.title !== 'string' || project.title.length > 300 || typeof project.description !== 'string' || project.description.length > 4000 || !['editorial', 'impact', 'cinema', 'minimal'].includes(project.style)) throw new Error('Ce fichier n’est pas un projet compatible.');
  if (!Array.isArray(project.variants) || project.variants.length !== 3 || project.variants.some(v => !v || typeof v.headline !== 'string' || v.headline.length > 100 || !Object.hasOwn(PALETTES, v.palette))) throw new Error('Les variantes du projet sont invalides.');
  if (typeof project.image !== 'string' || (project.image && project.image !== '/example.png' && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(project.image))) throw new Error('L’image du projet est invalide.');
  for (const key of ['eyebrow', 'signature']) if (typeof project[key] !== 'string' || project[key].length > 35) throw new Error('Les textes du projet sont invalides.');
  if (project.youtube && (!/^[A-Za-z0-9_-]{11}$/.test(project.youtube.id) || typeof project.youtube.title !== 'string' || project.youtube.title.length > 300)) throw new Error('La vidéo du projet est invalide.');
  if (project.portrait && (typeof project.portrait !== 'string' || project.portrait.length > 12 * 1024 * 1024 || !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(project.portrait))) throw new Error('Le portrait du projet est invalide.');
  return { ...project, youtube: project.youtube ? { id: project.youtube.id, title: project.youtube.title, channel: String(project.youtube.channel || '').slice(0, 100), contextSource: project.youtube.contextSource === 'description' ? 'description' : 'title' } : undefined, renderMode: project.renderMode === 'complete' ? 'complete' : 'overlay', referenceConfirmed: false, installed: undefined, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
$('#restore-project').onchange = async event => {
  try {
    if (isBusy) throw new Error('Attends la fin de la génération avant de restaurer un projet.');
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 32 * 1024 * 1024) throw new Error('Le projet dépasse 32 Mo.');
    const project = validateProject(JSON.parse(await file.text()));
    if (project.image) await loadImage(project.image);
    await displayProject(project); await persist(); $('#settings-dialog').close(); navigate('studio'); toast('Projet restauré dans la bibliothèque.');
  } catch (error) { showError(error); } finally { event.target.value = ''; }
};

async function renderLibrary() {
  if (!db) return;
  const projects = await database(store => store.getAll());
  const search = $('#library-search').value.toLocaleLowerCase('fr');
  const filtered = projects.filter(p => p.title.toLocaleLowerCase('fr').includes(search)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const parent = $('#library-grid'); parent.replaceChildren();
  if (!filtered.length) { const empty = document.createElement('div'); empty.className = 'empty-state'; const h = document.createElement('h2'); h.textContent = search ? 'Aucune idée trouvée.' : 'La première idée t’attend.'; const p = document.createElement('p'); p.textContent = search ? 'Essaie un autre mot-clé.' : 'Crée une miniature. Ton projet apparaîtra ici automatiquement.'; empty.append(h, p); parent.append(empty); }
  for (const project of filtered) {
    const card = document.createElement('article'); card.className = 'library-card';
    const open = document.createElement('button'); open.className = 'library-open';
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('div'); meta.className = 'library-meta';
    const h = document.createElement('h3'); h.textContent = project.title || 'Projet sans titre';
    const p = document.createElement('p'); p.textContent = `3 variantes · ${new Date(project.updatedAt).toLocaleDateString('fr-FR')}`;
    meta.append(h, p); open.append(canvas, meta);
    open.onclick = async () => { if (isBusy) { toast('Une génération est en cours.'); return; } if (saveTimer) await persist().catch(() => {}); await displayProject(project); navigate('studio'); };
    const actions = document.createElement('div'); actions.className = 'library-card-actions';
    const duplicate = document.createElement('button'); duplicate.className = 'text-button'; duplicate.textContent = 'Dupliquer';
    duplicate.onclick = async () => { try { const copy = structuredClone(project); copy.id = crypto.randomUUID(); copy.title = `${copy.title.slice(0, 290)} (copie)`; copy.updatedAt = new Date().toISOString(); await database(store => store.put(copy), 'readwrite'); await refreshCount(); await renderLibrary(); toast('Projet dupliqué.'); } catch (error) { showError(error); } };
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Supprimer';
    remove.onclick = async () => {
      if (isBusy) { toast('Une génération est en cours.'); return; }
      if (!confirm(`Supprimer « ${project.title || 'Projet sans titre'} » de ce navigateur ?`)) return;
      try { clearTimeout(saveTimer); await saveQueue.catch(() => {}); await database(store => store.delete(project.id), 'readwrite'); if (current.id === project.id) await displayProject(makeProject()); await refreshCount(); await renderLibrary(); } catch (error) { showError(error); }
    };
    actions.append(duplicate, remove); card.append(open, actions); parent.append(card);
    renderThumbnail(canvas, project, 0);
    loadImage(project.image).then(image => { if (card.isConnected) renderThumbnail(canvas, project, 0, image); }).catch(() => {});
  }
}
$('#library-search').oninput = () => renderLibrary().catch(showError);

$('#api-button').onclick = async () => {
  await refreshStatus();
  $('#api-dialog-description').textContent = status.configured ? `Fournisseur configuré · modèle ${status.model}. Cet appel utilise la facturation API séparée de ChatGPT Pro.` : 'Aucune clé API configurée. Pour ton abonnement Pro, utilise le bouton de génération principal avec Codex.';
  $('#confirm-api').disabled = !status.configured; openDialog('#api-dialog');
};
$('#confirm-api').onclick = async () => {
  $('#api-dialog').close(); updateBrief();
  if (!current.title) { showError(new Error('Indique d’abord un sujet de vidéo.')); return; }
  setBusy(true);
  try {
    const response = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: current.title, description: current.description, style: current.style }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    await useImage(result.image, 'api');
  } catch (error) { showError(error); } finally { setBusy(false); }
};


// The YouTube path keeps a complete native composition and a separate portrait reference.
async function youtubeAction(action, payload = {}) {
  const response = await fetch(`/api/youtube/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Action YouTube interrompue.');
  return result;
}
function videoURLFor(id) { return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`; }
function syncYouTubeUI() {
  const hasVideo = Boolean(current.youtube);
  const complete = current.renderMode === 'complete';
  $('#portrait-panel').classList.toggle('hidden', !hasVideo);
  $$('#composition-media, #compose-only, #prompt-button, #api-button, #api-note').forEach(node => node.classList.toggle('hidden', hasVideo));
  if (hasVideo && $('#portrait-preview').getAttribute('src') !== current.portrait) $('#portrait-preview').src = current.portrait || '';
  $('#portrait-source').textContent = current.portraitSource === 'upload' ? 'Portrait choisi sur cet ordinateur' : 'Visuel actuel de la vidéo';
  $('#complete-image').checked = complete;
  $('#complete-image').disabled = !current.image || isBusy;
  $('.variants-heading').classList.toggle('hidden', complete);
  $('#variants').classList.toggle('hidden', complete);
  $('.editor-fields').classList.toggle('hidden', complete);
  $('#composition-hint').textContent = complete ? 'Miniature complète · prête à valider' : 'Le texte reste modifiable ✎';
  $('#variant-label').textContent = complete ? 'Texte intégré · régénère pour le changer' : `Variante ${String(selected + 1).padStart(2, '0')}`;
  $('#review-button').disabled = !hasVideo || !loadedImage || isBusy || publishing;
  $('#publish-target').textContent = hasVideo ? current.youtube.title : 'Installer sur ta vidéo';
  $('#publish-status').textContent = current.installed ? `✓ Installée le ${new Date(current.installed.installedAt * 1000).toLocaleString('fr-FR')}. Une nouvelle installation remplacera cette miniature.` : hasVideo ? 'Vérifie le visuel, puis valide le fichier à installer.' : 'Importe un lien YouTube pour associer une vidéo.';
  if (!isBusy) $('#generate-button').textContent = hasVideo ? '✦ Générer avec mon visage ↗' : '✦ Générer mes 3 variantes ↗';
}
function syncConnectionUI() {
  const youtube = status.youtube || {};
  $('#youtube-connection-status').textContent = youtube.connected ? '✓ Connecté' : youtube.configured ? 'Client prêt · connexion requise' : 'À configurer';
  $('#youtube-connect').disabled = !youtube.configured;
  $('#youtube-connect').textContent = youtube.connected ? 'Changer de chaîne / reconnecter' : 'Connecter YouTube';
  $('#youtube-disconnect').classList.toggle('hidden', !youtube.connected);
  if (!connectionSeen) { $('#google-guide').open = !youtube.configured; connectionSeen = true; }
  if (youtube.connected && !youtube.waiting) $('#youtube-auth-link').classList.add('hidden');
  syncReviewUI();
}
$('#youtube-import-form').onsubmit = async event => {
  event.preventDefault();
  if (isBusy || publishing) return;
  setBusy(true);
  $('#youtube-import-status').textContent = 'Lecture de la vidéo…';
  try {
    const result = await youtubeAction('import', { url: $('#youtube-url').value.trim() });
    if (saveTimer) await persist();
    const project = makeProject();
    project.title = result.title; project.description = result.description;
    project.youtube = { id: result.id, title: result.title, channel: result.channel, contextSource: result.contextSource };
    project.portrait = result.reference; project.referenceConfirmed = false;
    project.signature = result.channel.slice(0, 35);
    await displayProject(project); await persist();
    $('#youtube-url').value = result.url;
    $('#youtube-import-status').textContent = result.contextSource === 'description' ? `${result.channel} · titre et description importés. Vérifie le portrait avant de générer.` : `${result.channel} · titre et visuel importés. Ajoute le contexte de la vidéo ou connecte YouTube pour sa description.`;
    toast('Vidéo importée. Vérifie ton visage, puis génère.');
  } catch (error) { $('#youtube-import-status').textContent = 'Import interrompu. Ton projet précédent est conservé.'; showError(error); }
  finally { setBusy(false); }
};
$('#portrait-confirmed').onchange = () => { current.referenceConfirmed = $('#portrait-confirmed').checked; scheduleSave(); };
$('#generation-headline').oninput = () => { current.generationHeadline = $('#generation-headline').value.trim(); scheduleSave(); };
$('#portrait-input').onchange = async event => {
  let url;
  try {
    const file = event.target.files[0]; if (!file || isBusy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error('Choisis une photo PNG, JPG ou WebP de moins de 20 Mo.');
    url = URL.createObjectURL(file); const image = await loadImage(url);
    if (image.width * image.height > 60000000) throw new Error('Réduis cette photo avant de l’importer.');
    const canvas = document.createElement('canvas'); const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    current.portrait = canvas.toDataURL('image/jpeg', 0.92); current.portraitSource = 'upload'; current.referenceConfirmed = false;
    $('#portrait-confirmed').checked = false; syncYouTubeUI(); await persist();
  } catch (error) { showError(error); } finally { if (url) URL.revokeObjectURL(url); event.target.value = ''; }
};
$('#complete-image').onchange = () => { current.renderMode = $('#complete-image').checked ? 'complete' : 'overlay'; renderCanvases(); syncEditor(); syncYouTubeUI(); scheduleSave(); };
$('#google-client').onchange = async event => {
  try {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 32768) throw new Error('Ce fichier ne ressemble pas à un client OAuth Google.');
    await youtubeAction('configure', JSON.parse(await file.text()));
    await refreshStatus(); toast('Client Google prêt. Clique sur Connecter YouTube.');
  } catch (error) { showError(error); } finally { event.target.value = ''; }
};
$('#youtube-connect').onclick = async () => {
  try {
    const result = await youtubeAction('connect');
    const link = $('#youtube-auth-link'); link.href = result.url; link.classList.remove('hidden');
    // Keep a visible continuation link if the browser blocks the new tab.
    window.open(result.url, '_blank', 'noopener,noreferrer');
    toast('Choisis ta chaîne dans la fenêtre Google. Le lien reste disponible ici.');
  } catch (error) { showError(error); }
};
$('#youtube-disconnect').onclick = async () => {
  try { await youtubeAction('disconnect'); $('#youtube-auth-link').classList.add('hidden'); await refreshStatus(); toast('Connexion YouTube retirée de ce studio.'); } catch (error) { showError(error); }
};
window.addEventListener('focus', () => refreshStatus());
setInterval(() => { if ($('#settings-dialog').open || $('#review-dialog').open) refreshStatus(); }, 5000);
function exportForReview() {
  const canvas = renderThumbnail(document.createElement('canvas'), current, selected, loadedImage);
  for (const quality of [0.92, 0.85, 0.7, 0.5]) {
    const data = canvas.toDataURL('image/jpeg', quality);
    if (data.length < 2 * 1024 * 1024 * 4 / 3) return data;
  }
  throw new Error('La miniature dépasse 2 Mo. Simplifie le visuel avant de l’envoyer.');
}
function syncReviewUI() {
  if (!activeReview) return;
  const approved = activeReview.status === 'approved';
  const installed = activeReview.status === 'installed';
  $('#approve-button').disabled = publishing || activeReview.status !== 'pending' || !$('#review-confirmed').checked;
  $('#install-button').disabled = publishing || !approved || !status.youtube?.connected;
  $('#review-confirmed').disabled = publishing || activeReview.status !== 'pending';
  $('#review-connect').classList.toggle('hidden', Boolean(status.youtube?.connected) || installed);
  $('#review-status').textContent = installed ? '✓ YouTube a confirmé l’installation de cette miniature.' : activeReview.status === 'uncertain' || activeReview.status === 'installing' ? 'Résultat incertain. Vérifie la miniature dans YouTube Studio avant de préparer un nouvel envoi.' : approved ? (status.youtube?.connected ? 'Visuel validé. Tu peux maintenant l’installer.' : 'Visuel validé. Connecte YouTube pour l’installer.') : 'Vérifie cet aperçu exact, puis coche la validation.';
}
$('#review-confirmed').onchange = syncReviewUI;
$('#review-connect').onclick = () => { $('#review-dialog').close(); refreshStatus(); openDialog('#settings-dialog'); };
$('#review-button').onclick = async () => {
  if (!current.youtube || !loadedImage || isBusy || publishing) return;
  publishing = true; syncYouTubeUI();
  try {
    reviewPixels = exportForReview(); reviewProject = current.id;
    activeReview = await youtubeAction('stage', { videoId: current.youtube.id, title: current.youtube.title, image: reviewPixels });
    $('#review-image').src = activeReview.imageUrl;
    $('#review-title').textContent = activeReview.title;
    $('#review-video').href = videoURLFor(activeReview.videoId);
    $('#review-confirmed').checked = false;
    await refreshStatus(); openDialog('#review-dialog');
  } catch (error) { showError(error); }
  finally { publishing = false; syncReviewUI(); syncYouTubeUI(); }
};
function checkReviewStillMatches() {
  if (!activeReview || current.id !== reviewProject || current.youtube?.id !== activeReview.videoId || exportForReview() !== reviewPixels) throw new Error('Le visuel ou la vidéo a changé. Ferme cette fenêtre et prépare un nouvel aperçu.');
}
$('#approve-button').onclick = async () => {
  if (publishing || !$('#review-confirmed').checked) return;
  publishing = true; syncReviewUI();
  try { checkReviewStillMatches(); activeReview = await youtubeAction('approve', { id: activeReview.id, videoId: activeReview.videoId, sha256: activeReview.sha256 }); }
  catch (error) { showError(error); }
  finally { publishing = false; syncReviewUI(); }
};
$('#install-button').onclick = async () => {
  if (publishing || activeReview?.status !== 'approved') return;
  publishing = true; syncReviewUI();
  try {
    checkReviewStillMatches();
    activeReview = await youtubeAction('install', { id: activeReview.id });
    current.installed = { videoId: activeReview.videoId, sha256: activeReview.sha256, installedAt: activeReview.installedAt };
    await persist(); toast('Miniature installée. YouTube a confirmé l’envoi.');
  } catch (error) {
    // Re-read persisted state after an ambiguous network result; never retry media automatically.
    try { const response = await fetch(`/api/youtube/reviews/${activeReview.id}`); if (response.ok) activeReview = await response.json(); } catch { activeReview.status = 'uncertain'; }
    showError(error);
  } finally { publishing = false; syncReviewUI(); syncYouTubeUI(); }
};

async function init() {
  try { db = await openDB(); await refreshCount(); } catch (error) { showError(error); }
  let project = makeProject(true);
  let pending;
  try { pending = JSON.parse(localStorage.getItem('thumbnail-pending')); } catch { localStorage.removeItem('thumbnail-pending'); }
  if (pending && db) project = await database(store => store.get(pending.project)) || project;
  else if (db) {
    const lastId = localStorage.getItem('thumbnail-current-project');
    if (lastId) project = await database(store => store.get(lastId)) || project;
  }
  await displayProject(project);
  await refreshStatus();
  if (['library', 'guide'].includes(location.hash.slice(1))) navigate(location.hash.slice(1));
  if (pending && project.id === pending.project) pollJob(pending.job, pending.project).catch(showError);
}
init().catch(showError);
