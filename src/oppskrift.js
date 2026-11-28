// Hjelpefunksjoner for kokeboka: lese ingredienslinjer, skalere og sjekke mot lageret.

const ENHETER = ['g', 'kg', 'ml', 'dl', 'l', 'ss', 'ts', 'stk', 'pk', 'boks', 'fedd', 'klype', 'never', 'skiver', 'bunt'];
const BRØK = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const BASIS = /^(salt|pepper|kvernet pepper|sort pepper|vann|olje|matolje|olivenolje|rapsolje|sukker|hvetemel|mel)$/i;

// «400 g kjøttdeig» → { navn: 'kjøttdeig', mengde: 400, enhet: 'g' }
export function tolkLinje(linje) {
  let t = linje.trim().replace(/^[-•*]\s*/, '');
  if (!t) return null;
  let mengde = null;
  const tall = t.match(/^(\d+\/\d+|\d+[.,]?\d*\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])\s*/);
  if (tall) {
    const r = tall[1].trim();
    if (r.includes('/')) { const [a, b] = r.split('/'); mengde = Number(a) / Number(b); }
    else {
      const brøk = [...r].find((c) => BRØK[c]);
      mengde = (Number(r.replace(/[½¼¾⅓⅔]/g, '').replace(',', '.')) || 0) + (brøk ? BRØK[brøk] : 0);
    }
    t = t.slice(tall[0].length);
  }
  let enhet = null;
  const e = t.match(/^([a-zæøå]+)\.?\s+/i);
  if (e && ENHETER.includes(e[1].toLowerCase())) { enhet = e[1].toLowerCase(); t = t.slice(e[0].length); }
  const navn = t.trim();
  return navn ? { navn, mengde, enhet, basis: BASIS.test(navn) } : null;
}

const tallTekst = (n) => {
  if (n == null) return '';
  const r = Math.round(n * 100) / 100;
  for (const [tegn, v] of Object.entries(BRØK)) if (Math.abs(r % 1 - v) < 0.02) return `${Math.floor(r) || ''}${tegn}`;
  return String(r).replace('.', ',');
};

export function ingrediensTekst(i, faktor = 1) {
  const m = i.mengde != null ? tallTekst(i.mengde * faktor) : '';
  return [m, i.enhet, i.navn].filter(Boolean).join(' ');
}

export const tilLinjer = (ingredienser) => (ingredienser || []).map((i) => ingrediensTekst(i)).join('\n');

// Ord som ikke sier hvilken vare det er.
const STØY = /\b(fersk|ferske|frossen|frosne|hakket|hakkede|finhakket|revet|revne|kokt|kokte|tørket|tørkede|store?|små|liten|stor|god|gode|ca|eventuelt|evt|til|servering|eller|og|med|av)\b/g;
const rens = (s) => s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(STØY, ' ').replace(/[^a-zæøå\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const stamme = (o) => o.replace(/(ene|er|en|et|e)$/, '');

// Finnes ingrediensen i lageret? Returnerer lagerraden som passer best, eller null.
export function finnILager(navn, lager) {
  const ord = rens(navn).split(' ').filter((o) => o.length >= 3);
  if (!ord.length) return null;
  const hoved = ord[ord.length - 1]; // «hel kylling» → kylling
  // Ordene i lagernavnet må begynne med ingrediensens hovedord («løk» finner «Løk», ikke «Hvitløk»),
  // og bøyde former godtas («gulrot» ↔ «Gulrøtter», «potet» ↔ «Poteter»).
  const prefiks = (o) => o.slice(0, Math.max(3, Math.min(o.length, o.length > 5 ? o.length - 2 : o.length)));
  const passer = (o, w) => w.startsWith(prefiks(stamme(o))) || stamme(w).startsWith(prefiks(stamme(o)))
    || (o.length >= 4 && w.endsWith(o)); // «melk» ↔ «Lettmelk»
  let best = null;
  for (const l of lager) {
    const ord2 = rens(l.navn).split(' ');
    const treff = ord2.some((w) => passer(hoved, w)) || ord.some((o) => o.length >= 5 && ord2.some((w) => passer(o, w)));
    if (treff && (!best || Number(l.andel) > Number(best.andel))) best = l;
  }
  return best;
}

// Status per ingrediens: har (finnes i lageret), basis (regnes som alltid hjemme) eller mangler.
export function sjekkMotLager(ingredienser, lager) {
  return (ingredienser || []).map((i) => {
    const treff = finnILager(i.navn, lager);
    return { ...i, treff, status: treff ? 'har' : i.basis ? 'basis' : 'mangler' };
  });
}

// Gjør Claudes svar om til en oppskrift vi kan lagre.
export function fraClaude(r) {
  return {
    navn: r.navn || 'Ny oppskrift',
    beskrivelse: r.beskrivelse || null,
    porsjoner: Math.max(1, parseInt(r.porsjoner, 10) || 4),
    tid_min: parseInt(r.tid_min, 10) || null,
    kategori: r.kategori || 'middag',
    ingredienser: (r.ingredienser || []).filter((i) => i?.navn).map((i) => ({
      navn: String(i.navn), mengde: i.mengde == null || i.mengde === '' ? null : Number(i.mengde) || null,
      enhet: i.enhet || null, basis: Boolean(i.basis) || BASIS.test(String(i.navn)),
    })),
    fremgangsmate: (r.fremgangsmate || []).map(String).filter(Boolean),
  };
}
