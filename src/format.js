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

// Butikkens avdelinger i den rekkefølgen man typisk går gjennom butikken.
export const AVDELINGER = [
  ['frukt_gront', 'Frukt og grønt'],
  ['brod_bakst', 'Brød og bakst'],
  ['meieri', 'Meieri og egg'],
  ['kjott', 'Kjøtt'],
  ['fisk', 'Fisk'],
  ['palegg', 'Pålegg'],
  ['torrvarer', 'Tørrvarer'],
  ['hermetikk', 'Hermetikk'],
  ['frossen', 'Frysedisk'],
  ['drikke', 'Drikke'],
  ['annet', 'Annet'],
  ['ikke_mat', 'Husholdning'],
];
export const avdelingNavn = (a) => (AVDELINGER.find(([k]) => k === a) || [a, 'Annet'])[1];
export const avdelingRekke = (a) => { const i = AVDELINGER.findIndex(([k]) => k === (a === 'hjemmelaget' ? 'annet' : a)); return i < 0 ? 10 : i; };

const NØKKELORD = [
  ['frukt_gront', /banan|eple|pære|appelsin|sitron|lime|drue|bær|agurk|tomat|salat|løk|potet|gulrot|paprika|brokkoli|kål|avokado|sopp|hvitløk|ingefær|frukt|grønt/],
  ['brod_bakst', /brød|rundstykk|lompe|tortilla|lefse|knekkebrød|baguett|boller|kake/],
  ['meieri', /melk|ost|yoghurt|smør|egg|fløte|rømme|kesam|cottage|biola|skyr|margarin/],
  ['kjott', /kjøtt|kylling|svin|bacon|pølse|biff|karbonade|lam|kalkun|skinke(?!pålegg)/],
  ['fisk', /fisk|laks|torsk|sei|reke|makrell|tunfisk|fiskeboller/],
  ['palegg', /pålegg|salami|leverpostei|syltetøy|nugatti|kaviar|servelat|hummus/],
  ['torrvarer', /ris|pasta|spagetti|mel|sukker|havre|gryn|kaffe|te\b|krydder|salt|pepper|buljong|olje|müsli|cornflakes|nøtter|taco/],
  ['hermetikk', /boks|hermetikk|bønner|mais|tomatpuré|kokosmelk/],
  ['frossen', /\bis\b|frossen|fryst|pizza|frosne/],
  ['drikke', /brus|juice|vann|øl|cola|pepsi|solo|saft|kaffe på boks/],
  ['ikke_mat', /papir|såpe|vask|tørkerull|bleie|tannkrem|sjampo|oppvask|pose|folie|batteri/],
];
export function gjettAvdeling(navn) {
  const n = (navn || '').toLowerCase();
  return (NØKKELORD.find(([, r]) => r.test(n)) || ['annet'])[0];
}

// Neste handledag (1 = mandag … 7 = søndag) fra i dag.
export function nesteHandledag(dag = 4, time = 14) {
  const nå = new Date();
  const iDag = ((nå.getDay() + 6) % 7) + 1;
  let om = (dag - iDag + 7) % 7;
  if (om === 0 && nå.getHours() >= time + 4) om = 7;
  return new Date(nå.getFullYear(), nå.getMonth(), nå.getDate() + om);
}

// Mandag i uka for en dato, som ÅÅÅÅ-MM-DD.
export function ukeStart(dato = new Date()) {
  const d = new Date(dato.getFullYear(), dato.getMonth(), dato.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Rest i prosent ut fra vekt: (vekt − emballasje) / innhold. 1 ml regnes som 1 g. Null hvis noe mangler.
export function andelFraVekt(vekt, tara, netto) {
  if (!(vekt > 0) || tara == null || !(netto > 0)) return null;
  return Math.min(1, Math.max(0, (vekt - Number(tara)) / Number(netto)));
}
export const nettoAv = (mengde, enhet) => (enhet === 'g' || enhet === 'ml') && mengde > 0 ? Number(mengde) : null;
