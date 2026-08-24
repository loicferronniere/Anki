/**
 * Contrôleur principal de l'app Vocabulaire.
 * Tout est stocké en localStorage — aucun serveur, aucun compte.
 */

const STORAGE_KEYS = {
  decks: 'vocabapp.decks',
  cards: 'vocabapp.cards',
  stats: 'vocabapp.stats',
};

// ---- Stockage ----------------------------------------------------------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let decks = loadJSON(STORAGE_KEYS.decks, []);
let cards = loadJSON(STORAGE_KEYS.cards, []);
let stats = loadJSON(STORAGE_KEYS.stats, { streak: 0, lastStudyDate: null, totalReviews: 0 });

function persistDecks() { saveJSON(STORAGE_KEYS.decks, decks); }
function persistCards() { saveJSON(STORAGE_KEYS.cards, cards); }
function persistStats() { saveJSON(STORAGE_KEYS.stats, stats); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---- Navigation ---------------------------------------------------------

document.querySelectorAll('nav button').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view, btn));
});

function switchView(id, btn) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  if (id === 'view-reviser') renderReview();
  if (id === 'view-listes') renderDecks();
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ---- Vue Réviser ----------------------------------------------------------

let reviewQueue = [];
let sessionTotal = 0;
let sessionDone = 0;

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// Dégradé de couleur par boîte (1 → ambre, 5 → brun profond), sans la couleur "principale"
const BOX_GRADIENTS = {
  1: ['#F49F31', '#C97E22'],
  2: ['#CC7D27', '#A25A1C'],
  3: ['#A45C1C', '#7F4315'],
  4: ['#7C3A12', '#642D0E'],
  5: ['#642D0E', '#541807'],
};

function buildQueue() {
  const today = todayISO();
  return cards.filter((c) => c.due <= today).sort((a, b) => a.due.localeCompare(b.due));
}

function renderReview() {
  reviewQueue = buildQueue();
  sessionTotal = reviewQueue.length;
  sessionDone = 0;
  document.getElementById('deckCount').textContent =
    cards.length + (cards.length === 1 ? ' mot' : ' mots');
  updateRing();
  renderCurrentCard();
}

function updateRing() {
  const circumference = 169.6;
  const fraction = sessionTotal === 0 ? 0 : sessionDone / sessionTotal;
  document.getElementById('ringProgress').style.strokeDashoffset =
    circumference * (1 - fraction);
  document.getElementById('ringNum').textContent = `${sessionDone} / ${sessionTotal} cartes`;
}

function renderCurrentCard() {
  const area = document.getElementById('reviewArea');

  if (reviewQueue.length === 0) {
    area.innerHTML = cards.length === 0
      ? `<div class="empty-state">
           <div class="big">📇</div>
           <p><strong>Aucun mot pour l'instant.</strong></p>
           <p>Va dans <a href="#" onclick="switchView('view-importer', document.querySelectorAll('nav button')[1]); return false;">Importer</a> pour ajouter une liste.</p>
         </div>`
      : `<div class="empty-state">
           <div class="big">✅</div>
           <p><strong>Tout est à jour.</strong></p>
           <p>Reviens plus tard pour la prochaine série de révisions.</p>
         </div>`;
    return;
  }

  const card = reviewQueue[0];
  const deck = decks.find((d) => d.id === card.deckId);
  const [c1, c2] = BOX_GRADIENTS[card.box] || BOX_GRADIENTS[1];
  const iv = previewIntervals(card);
  const reviewedLabel = card.lastReview
    ? `↻ revu le ${new Date(card.lastReview).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
    : '★ nouvelle carte';

  area.innerHTML = `
    <div class="card-wrap">
      <div class="card" id="card" style="--c1:${c1}; --c2:${c2};">
        <div class="card-face">
          <span class="chip">Boîte ${card.box}${deck ? ' · ' + escapeHtml(deck.name) : ''}</span>
          <div class="word-block">
            <p class="word-fr">${escapeHtml(card.front)}</p>
            <p class="flip-hint">Touche la carte pour révéler la traduction</p>
          </div>
        </div>
        <div class="card-face card-back">
          <span class="chip">Boîte ${card.box}</span>
          <div class="word-block">
            <p class="word-fr">${escapeHtml(card.front)}</p>
            <p class="word-en">${escapeHtml(card.back)}</p>
          </div>
          <span class="review-chip">${reviewedLabel}</span>
        </div>
      </div>
    </div>

    <button class="reveal-btn" id="revealBtn">Retourner la carte</button>

    <div class="answers" id="answers" hidden style="margin-top:10px;">
      <button class="btn-encore" data-grade="again">↺<span>Encore</span><small>${formatDays(iv.again)}</small></button>
      <button class="btn-difficile" data-grade="hard">〜<span>Difficile</span><small>${formatDays(iv.hard)}</small></button>
      <button class="btn-facile" data-grade="easy">✓<span>Facile</span><small>${formatDays(iv.easy)}</small></button>
    </div>
  `;

  const cardEl = document.getElementById('card');
  const revealBtn = document.getElementById('revealBtn');
  const answers = document.getElementById('answers');

  function toggleFlip() {
    const flipped = cardEl.classList.toggle('flipped');
    answers.hidden = !flipped;
    revealBtn.style.display = flipped ? 'none' : 'block';
  }

  cardEl.addEventListener('click', toggleFlip);
  revealBtn.addEventListener('click', toggleFlip);

  answers.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => answerCard(card, btn.dataset.grade));
  });
}

function answerCard(card, grade) {
  const state = nextReviewState(card, grade);
  Object.assign(card, state);
  persistCards();

  stats.totalReviews += 1;
  const today = todayISO();
  if (stats.lastStudyDate !== today) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yISO = yesterday.toISOString().slice(0, 10);
    stats.streak = stats.lastStudyDate === yISO ? stats.streak + 1 : 1;
    stats.lastStudyDate = today;
  }
  persistStats();

  reviewQueue.shift();
  sessionDone += 1;
  updateRing();
  renderCurrentCard();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Vue Importer ----------------------------------------------------------

let pendingImport = null; // { name, source, items: [{front, back}] }

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const pasteArea = document.getElementById('pasteArea');
const importBtn = document.getElementById('importBtn');
const importStatus = document.getElementById('importStatus');
const previewBox = document.getElementById('previewBox');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  pasteArea.value = '';
  importStatus.textContent = 'Lecture du fichier…';
  importBtn.disabled = true;
  previewBox.style.display = 'none';

  try {
    let items;
    if (file.name.toLowerCase().endsWith('.apkg')) {
      items = await parseApkg(file);
    } else {
      const text = await file.text();
      items = parsePastedList(text);
    }

    if (!items.length) {
      importStatus.textContent = "Aucun mot trouvé dans ce fichier.";
      return;
    }

    pendingImport = { name: file.name, source: 'import', items };
    showPreview();
    importStatus.textContent = '';
  } catch (err) {
    importStatus.textContent = "Erreur : " + err.message;
  }
}

pasteArea.addEventListener('input', () => {
  const items = parsePastedList(pasteArea.value);
  if (items.length) {
    pendingImport = { name: 'Liste collée', source: 'paste', items };
    showPreview();
    importStatus.textContent = '';
  } else {
    pendingImport = null;
    previewBox.style.display = 'none';
    importBtn.disabled = true;
  }
});

function showPreview() {
  const { name, items } = pendingImport;
  document.getElementById('previewName').textContent = name;
  document.getElementById('previewCount').textContent =
    `${items.length} mot${items.length > 1 ? 's' : ''}`;

  const rowsEl = document.getElementById('previewRows');
  rowsEl.innerHTML = items.slice(0, 4).map(
    (it) => `<div class="preview-row"><span>${escapeHtml(it.front)}</span><span>${escapeHtml(it.back)}</span></div>`
  ).join('');
  if (items.length > 4) {
    rowsEl.innerHTML += `<div class="preview-more">+ ${items.length - 4} autres</div>`;
  }

  previewBox.style.display = 'block';
  importBtn.disabled = false;
  importBtn.textContent = `Importer les ${items.length} mots`;
}

importBtn.addEventListener('click', () => {
  if (!pendingImport) return;

  const deckId = uid();
  const deckName = pendingImport.name.replace(/\.(apkg|csv|txt)$/i, '');
  decks.push({ id: deckId, name: deckName, createdAt: new Date().toISOString() });

  const today = todayISO();
  for (const item of pendingImport.items) {
    cards.push({
      id: uid(),
      deckId,
      front: item.front,
      back: item.back,
      box: 1,
      due: today,
      createdAt: new Date().toISOString(),
      lastReview: null,
    });
  }
  persistDecks();
  persistCards();

  showToast(`${pendingImport.items.length} mots importés`);

  pendingImport = null;
  pasteArea.value = '';
  fileInput.value = '';
  previewBox.style.display = 'none';
  importBtn.disabled = true;
  importStatus.textContent = '';

  switchView('view-listes', document.querySelectorAll('nav button')[2]);
});

// ---- Vue Mes listes ----------------------------------------------------------

function renderDecks() {
  const listEl = document.getElementById('deckList');
  const today = todayISO();

  if (decks.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <div class="big">🗂️</div>
      <p><strong>Aucune liste importée.</strong></p>
    </div>`;
  } else {
    listEl.innerHTML = decks.map((deck) => {
      const deckCards = cards.filter((c) => c.deckId === deck.id);
      const total = deckCards.length;
      const dueToday = deckCards.filter((c) => c.due <= today).length;
      const mastered = deckCards.filter((c) => c.box === 5).length;

      const counts = [1, 2, 3, 4, 5].map((b) => deckCards.filter((c) => c.box === b).length);
      const bars = counts.map((n, i) => {
        const pct = total === 0 ? 0 : (n / total) * 100;
        const color = BOX_GRADIENTS[i + 1][0];
        return `<div style="width:${pct}%; background:${color}"></div>`;
      }).join('');

      return `
        <div class="deck">
          <div class="deck-top">
            <strong>${escapeHtml(deck.name)}</strong>
            <span>${total} mot${total > 1 ? 's' : ''}</span>
          </div>
          <div class="stackbar">${bars}</div>
          <div class="deck-foot">
            <span>${mastered} mot${mastered > 1 ? 's' : ''} maîtrisé${mastered > 1 ? 's' : ''}</span>
            <span>${dueToday} à réviser aujourd'hui</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('statStreak').textContent = stats.streak;
  document.getElementById('statTotal').textContent = stats.totalReviews;
}

// ---- Démarrage ----------------------------------------------------------

renderReview();
