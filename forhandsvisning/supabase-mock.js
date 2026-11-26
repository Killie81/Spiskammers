// Kun for lokal forhåndsvisning med eksempeldata. Brukes ikke i appen som publiseres.
const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const LAGER = [
  { id: '1', produkt_id: 'p1', sted: 'kjoleskap', andel: 0.6, holdbarhet: d(1), dato_type: 'siste_forbruksdag', apnet: d(-2), navn: 'Lettmelk', merke: 'Tine', pakning_mengde: 1000, pakning_enhet: 'ml' },
  { id: '2', produkt_id: 'p2', sted: 'kjoleskap', andel: 1, holdbarhet: d(2), dato_type: 'siste_forbruksdag', apnet: null, navn: 'Kjøttdeig', merke: 'Gilde', pakning_mengde: 400, pakning_enhet: 'g' },
  { id: '3', produkt_id: 'p3', sted: 'kjoleskap', andel: 0.35, holdbarhet: d(4), dato_type: 'best_for', apnet: d(-5), navn: 'Norvegia', merke: 'Tine', pakning_mengde: 500, pakning_enhet: 'g' },
  { id: '4', produkt_id: 'p4', sted: 'fryser', andel: 1, holdbarhet: d(120), dato_type: 'best_for', apnet: null, navn: 'Laksefilet', merke: 'Lerøy', pakning_mengde: 500, pakning_enhet: 'g' },
  { id: '5', produkt_id: 'p5', sted: 'skap', andel: 0.25, holdbarhet: d(240), dato_type: 'best_for', apnet: d(-30), navn: 'Havregryn', merke: 'Axa', pakning_mengde: 1000, pakning_enhet: 'g' },
  { id: '9', produkt_id: 'p9', sted: 'skap', andel: 1, holdbarhet: d(300), dato_type: 'best_for', apnet: null, navn: 'Jasminris', merke: 'Toro', pakning_mengde: 1000, pakning_enhet: 'g' },
  { id: '10', produkt_id: 'p9', sted: 'skap', andel: 1, holdbarhet: d(280), dato_type: 'best_for', apnet: null, navn: 'Jasminris', merke: 'Toro', pakning_mengde: 1000, pakning_enhet: 'g' },
  { id: '11', produkt_id: 'p9', sted: 'skap', andel: 1, holdbarhet: d(320), dato_type: 'best_for', apnet: null, navn: 'Jasminris', merke: 'Toro', pakning_mengde: 1000, pakning_enhet: 'g' },
  { id: '6', produkt_id: 'p6', sted: 'bod', andel: 1, holdbarhet: d(60), dato_type: 'best_for', apnet: null, navn: 'Pepsi Max 1,5 l', merke: 'Pepsi', pakning_mengde: 1500, pakning_enhet: 'ml' },
  { id: '7', produkt_id: 'p7', sted: 'skuffe', andel: 0.8, holdbarhet: d(6), dato_type: 'anslag', apnet: null, navn: 'Gulrøtter', merke: null, pakning_mengde: 750, pakning_enhet: 'g' },
  { id: '8', produkt_id: 'p8', sted: 'kjoleskap', andel: 0.9, holdbarhet: null, dato_type: null, apnet: d(-1), navn: 'Lapskaus, 4 porsjoner', merke: null, pakning_mengde: null, pakning_enhet: 'stk' },
];
const HL = [
  { id: 'h1', navn: 'Lettmelk', antall: 4, avdeling: 'meieri', kilde: 'forslag', begrunnelse: 'Bruker ca. 3,0 pk/uke, nok til 1 d', avkrysset: false, status: 'aktiv' },
  { id: 'h2', navn: 'Agurk', antall: 1, avdeling: 'frukt_gront', kilde: 'forslag', begrunnelse: 'Bruker ca. 1,0 pk/uke, nok til 7 d · ofte kastet, foreslår mindre', avkrysset: false, status: 'aktiv' },
  { id: 'h3', navn: 'Bananer', antall: 6, avdeling: 'frukt_gront', kilde: 'manuell', begrunnelse: null, avkrysset: true, status: 'aktiv' },
  { id: 'h4', navn: 'Kaffe', antall: 1, avdeling: 'torrvarer', kilde: 'fast', begrunnelse: 'Fast vare', avkrysset: false, status: 'aktiv' },
  { id: 'h5', navn: 'Smør', antall: 1, avdeling: 'meieri', kilde: 'forslag', begrunnelse: 'Snart tom', avkrysset: false, status: 'aktiv' },
  { id: 'h6', navn: 'Kyllingfilet', antall: 2, avdeling: 'kjott', kilde: 'manuell', begrunnelse: null, avkrysset: false, status: 'aktiv' },
  { id: 'h7', navn: 'Tørkerull', antall: 1, avdeling: 'ikke_mat', kilde: 'manuell', begrunnelse: null, avkrysset: false, status: 'aktiv' },
];
const DATA = { lager: LAGER, handleliste_vare: HL, unormal_uke: [{ uke: '2026-11-16' }], husstand: [{ id: 'h', navn: 'Hjemme', glass_ml: 300, handledag: 4, handletime: 14 }],
  utgift: [{ type: 'pose', belop: 4.5, antall: 1 }, { type: 'pose', belop: 9, antall: 2 }, { type: 'pant', belop: 6 }], hendelse: [{ id: 'a' }, { id: 'b' }] };
const kjede = (tabell) => { const svar = { data: DATA[tabell] || [], error: null };
  const k = new Proxy({}, { get: (_, p) => p === 'then' ? (r) => r(svar) : p === 'single' ? () => Promise.resolve({ data: (DATA[tabell] || [])[0], error: null }) : () => k });
  return k; };
export const konfigurert = true;
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: kjede,
};
export async function rpc(navn) { return navn === 'opprett_husstand' ? 'h' : null; }
export async function hentLager() { return LAGER; }
export async function spørClaude() { return {}; }
export async function lastOppBilde() { return null; }
