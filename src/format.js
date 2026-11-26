export const STEDER = [
  ['kjoleskap', 'Kjøleskap'],
  ['fryser', 'Fryser'],
  ['bod', 'Bod'],
  ['skap', 'Skap'],
  ['skuffe', 'Skuffe'],
];
export const stedNavn = (s) => (STEDER.find(([v]) => v === s) || [s, s || '–'])[1];

export const nf = (x, d = 1) => Number(x).toLocaleString('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const kr = (x) => (typeof x === 'number' ? x.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
export const prosent = (a) => `${Math.round(Number(a) * 100)} %`;

export function idag() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Oslo' });
}

export function dagerIgjen(dato) {
  if (!dato) return null;
  return Math.round((Date.parse(dato) - Date.parse(idag())) / 864e5);
}

export function holdbarTekst(dato) {
  const d = dagerIgjen(dato);
  if (d == null) return 'ingen dato';
  if (d < 0) return `gått ut for ${-d} d siden`;
  if (d === 0) return 'går ut i dag';
  if (d === 1) return 'går ut i morgen';
  return `${d} d igjen`;
}

export function leggTilDager(dato, dager) {
  const t = Date.parse(dato || idag()) + dager * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}

// Hvor stor andel av pakningen er ett glass?
export function glassAndel(pakningMengde, enhet, glassMl) {
  if (enhet !== 'ml' || !pakningMengde) return null;
  return glassMl / pakningMengde;
}

// Slå sammen like, uåpnede pakninger av samme vare på samme sted til én linje («Jasminris · 8 stk»)
// når de har samme holdbarhet, eller når holdbarheten er mer enn to uker unna. Åpnede pakninger vises alltid hver for seg.
export function grupper(lager) {
  const grupper = new Map();
  for (const p of lager) {
    const d = dagerIgjen(p.holdbarhet);
    const datonøkkel = Number(p.andel) < 1 ? `åpnet-${p.id}` : d == null || d > 14 ? 'lang' : p.holdbarhet;
    const nøkkel = `${p.produkt_id}|${p.sted}|${datonøkkel}`;
    const g = grupper.get(nøkkel);
    if (g) g.pakninger.push(p);
    else grupper.set(nøkkel, { nøkkel, pakninger: [p] });
  }
  return [...grupper.values()].map((g) => {
    // Den som går ut først representerer gruppen, og er den som tas ut først.
    g.pakninger.sort((a, b) => (dagerIgjen(a.holdbarhet) ?? 99999) - (dagerIgjen(b.holdbarhet) ?? 99999));
    return { ...g.pakninger[0], antall: g.pakninger.length, pakninger: g.pakninger, nøkkel: g.nøkkel };
  });
}
