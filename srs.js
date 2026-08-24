/**
 * Moteur de répétition espacée — système à 5 "boîtes" (façon Leitner).
 *
 * Chaque carte a un niveau de boîte (1 à 5). Plus la boîte est haute,
 * plus l'intervalle avant la prochaine révision est long.
 *
 *   Boîte 1 →  1 jour     (mot tout juste vu / mal su)
 *   Boîte 2 →  3 jours
 *   Boîte 3 →  7 jours
 *   Boîte 4 →  15 jours
 *   Boîte 5 →  30 jours    (mot bien maîtrisé)
 *
 * Réponse "Encore"    → retour boîte 1
 * Réponse "Difficile" → reste sur place (ou boîte 1 si c'était déjà là)
 * Réponse "Facile"    → monte d'une boîte (max 5)
 */

const SRS_INTERVALS = [1, 3, 7, 15, 30];

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calcule le nouvel état d'une carte après une réponse.
 * @param {object} card - doit avoir un champ `box` (1-5)
 * @param {'again'|'hard'|'easy'} grade
 * @returns {{box:number, due:string, lastReview:string, intervalDays:number}}
 */
function nextReviewState(card, grade) {
  let box = card.box || 1;

  if (grade === 'again') {
    box = 1;
  } else if (grade === 'hard') {
    box = Math.max(1, box);
  } else if (grade === 'easy') {
    box = Math.min(SRS_INTERVALS.length, box + 1);
  }

  const intervalDays = SRS_INTERVALS[box - 1];

  return {
    box,
    due: addDaysISO(intervalDays),
    lastReview: new Date().toISOString(),
    intervalDays,
  };
}

/** Texte court à afficher sur les boutons de réponse, en fonction de la boîte actuelle de la carte. */
function previewIntervals(card) {
  const box = card.box || 1;
  const again = SRS_INTERVALS[0];
  const hard = SRS_INTERVALS[Math.max(0, box - 1)];
  const easy = SRS_INTERVALS[Math.min(SRS_INTERVALS.length - 1, box)];
  return { again, hard, easy };
}

function formatDays(n) {
  return n === 1 ? 'demain' : `${n} jours`;
}
