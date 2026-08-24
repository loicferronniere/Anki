/**
 * Import de fichiers .apkg (Anki) — 100% côté navigateur, sans serveur.
 *
 * Un .apkg est une archive zip contenant une base SQLite (collection.anki2
 * ou collection.anki21). On la lit avec sql.js (SQLite compilé en WASM) et
 * on extrait les deux premiers champs de chaque note (recto / verso).
 *
 * Nécessite JSZip et sql.js, chargés en CDN dans index.html.
 */

let _sqlJsPromise = null;

function getSqlJs() {
  if (!_sqlJsPromise) {
    _sqlJsPromise = initSqlJs({
      locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.7.0/${file}`,
    });
  }
  return _sqlJsPromise;
}

/**
 * Nettoie un champ Anki : retire les tags HTML basiques et un éventuel
 * préfixe entre crochets (ex: "[en] hello" → "hello").
 */
function cleanField(raw) {
  if (!raw) return '';
  let text = raw
    .replace(/<[^>]*>/g, ' ')   // tags HTML
    .replace(/\[sound:[^\]]*\]/gi, '') // pièces audio Anki
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  text = text.replace(/^\[\w+\]\s*/, ''); // ex: "[en] " en préfixe
  return text;
}

/**
 * Parse un fichier .apkg et retourne un tableau de {front, back}.
 * @param {File} file
 * @returns {Promise<{front:string, back:string}[]>}
 */
async function parseApkg(file) {
  const [SQL, zipBuffer] = await Promise.all([getSqlJs(), file.arrayBuffer()]);

  const zip = await JSZip.loadAsync(zipBuffer);

  // Anki récent exporte collection.anki21, les versions plus anciennes
  // collection.anki2. On essaie les deux.
  let dbEntry = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!dbEntry) {
    throw new Error("Ce fichier .apkg ne contient pas de base Anki reconnue (collection.anki2/anki21 introuvable).");
  }

  const dbBytes = await dbEntry.async('uint8array');
  const db = new SQL.Database(dbBytes);

  let rows;
  try {
    const result = db.exec('SELECT flds FROM notes');
    rows = result.length ? result[0].values : [];
  } finally {
    db.close();
  }

  const cards = [];
  for (const [flds] of rows) {
    if (typeof flds !== 'string') continue;
    const fields = flds.split('\x1f'); // séparateur de champs Anki
    const front = cleanField(fields[0]);
    const back = cleanField(fields[1]);
    if (front && back) {
      cards.push({ front, back });
    }
  }

  return cards;
}

/**
 * Parse un texte collé à la main : une paire par ligne,
 * séparée par ';', une tabulation, ou une virgule.
 * @param {string} text
 * @returns {{front:string, back:string}[]}
 */
function parsePastedList(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const cards = [];
  for (const line of lines) {
    const parts = line.split(/;|\t|,(?!\s*\d)/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      cards.push({ front: parts[0], back: parts[1] });
    }
  }
  return cards;
}
