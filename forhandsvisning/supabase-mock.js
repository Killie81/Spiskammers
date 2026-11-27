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
  { id: 'h1', navn: 'Lettmelk', antall: 4, avdeling: 'meieri', kilde: 'forslag', begrunnelse: 'Bruker ca. 3,0 pk/uke, nok til 1 d', avkrysset: true, status: 'aktiv' },
  { id: 'h2', navn: 'Agurk', antall: 1, avdeling: 'frukt_gront', kilde: 'forslag', begrunnelse: 'Bruker ca. 1,0 pk/uke, nok til 7 d · ofte kastet, foreslår mindre', avkrysset: false, status: 'aktiv' },
  { id: 'h3', navn: 'Bananer', antall: 6, avdeling: 'frukt_gront', kilde: 'manuell', begrunnelse: null, avkrysset: true, status: 'aktiv' },
  { id: 'h4', navn: 'Kaffe', antall: 1, avdeling: 'torrvarer', kilde: 'fast', begrunnelse: 'Fast vare', avkrysset: false, status: 'aktiv' },
  { id: 'h5', navn: 'Smør', antall: 1, avdeling: 'meieri', kilde: 'forslag', begrunnelse: 'Snart tom', avkrysset: false, status: 'aktiv' },
  { id: 'h6', navn: 'Kyllingfilet', antall: 2, avdeling: 'kjott', kilde: 'manuell', begrunnelse: null, avkrysset: false, status: 'aktiv' },
  { id: 'h7', navn: 'Tørkerull', antall: 1, avdeling: 'ikke_mat', kilde: 'manuell', begrunnelse: null, avkrysset: false, status: 'aktiv' },
];
for (let i = 0; i < 5; i++) LAGER.push({ id: `b${i}`, produkt_id: 'pb', sted: 'bod', andel: 1, holdbarhet: d(4 + i % 2), dato_type: 'anslag', apnet: null, navn: 'Bananer', merke: null, pakning_mengde: 1, pakning_enhet: 'stk', stykkvis: true });
LAGER.push({ id: 'k1', produkt_id: 'pk', sted: 'skap', andel: 1, holdbarhet: d(90), dato_type: 'best_for', apnet: null, navn: 'Kvikk Lunsj', merke: 'Freia', pakning_mengde: 47, pakning_enhet: 'g' });
LAGER.push({ id: 'k2', produkt_id: 'pg', sted: 'skap', andel: 0.5, holdbarhet: d(60), dato_type: 'best_for', apnet: d(-1), apnet_av: 'Ola', navn: 'Smågodt', merke: null, pakning_mengde: 300, pakning_enhet: 'g' });
const KAT = {"Lettmelk": "meieri", "Kjøttdeig": "kjott", "Norvegia": "meieri", "Laksefilet": "fisk", "Havregryn": "torrvarer", "Jasminris": "torrvarer", "Pepsi Max 1,5 l": "drikke", "Gulrøtter": "frukt_gront", "Lapskaus, 4 porsjoner": "hjemmelaget", "Bananer": "frukt_gront", "Kvikk Lunsj": "sotsaker", "Smågodt": "sotsaker"};
LAGER.forEach((p) => { p.kategori = KAT[p.navn] || 'annet'; });
LAGER.forEach((p) => { p.tara_g = p.navn === 'Lettmelk' ? 32 : null; p.netto_g = p.pakning_mengde; });
const KURV = [
  { id: 'kv1', handleliste_id: 'h1', navn: 'Lettmelk', merke: 'Tine', pakning_mengde: 1, pakning_enhet: 'l', holdbarhet: d(9), lagringssted: 'kjoleskap', antall: 4, status: 'i_kurv' },
  { id: 'kv2', handleliste_id: null, navn: 'Kvikk Lunsj 3-pk', merke: 'Freia', pakning_mengde: 141, pakning_enhet: 'g', holdbarhet: d(200), lagringssted: 'skap', antall: 1, status: 'i_kurv' },
];
const DATA = { kurv_vare: KURV, produkt: [], beholder: [{ id: 'b1', navn: 'Krydderglass', vekt_g: 85 }, { id: 'b2', navn: 'Glassboks 1 l', vekt_g: 410 }], lager: LAGER, handleliste_vare: HL, unormal_uke: [{ uke: '2026-11-16' }], husstand: [{ id: 'h', navn: 'Hjemme', glass_ml: 300, handledag: 4, handletime: 14, personer: ['Kari', 'Ola', 'Nora', 'Per'] }],
  utgift: [{ type: 'pose', belop: 4.5, antall: 1 }, { type: 'pose', belop: 9, antall: 2 }, { type: 'pant', belop: 6 }], hendelse: [{ id: 'a' }, { id: 'b' }] };
const kjede = (tabell) => { const svar = { data: DATA[tabell] || [], error: null };
  const k = new Proxy({}, { get: (_, p) => p === 'then' ? (r) => r(svar) : p === 'single' ? () => Promise.resolve({ data: (DATA[tabell] || [])[0], error: null }) : () => k });
  return k; };
export const konfigurert = true;
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {} },
  from: kjede,
};
export async function rpc(navn, a) { if (navn === 'ta_ut_stk') return Array.from({ length: a.p_antall }, (_, i) => `h${i}`); if (navn === 'registrer_inn') return ['x']; return navn === 'opprett_husstand' ? 'h' : null; }
export async function hentLager() { return LAGER; }
export async function spørClaude(b) {
  if (b.modus === 'uttak' && globalThis.MOCK_BANAN) return { pakning_id: 'b0', vare: 'Banan', antall_stk: 2, andel_igjen: null, grunnlag_mengde: 'To bananer' };
  if (b.modus === 'uttak') return { pakning_id: '1', vare: 'Lettmelk', andel_igjen: 0.4, vekt_g: 452, grunnlag_mengde: 'Anslått fra bildet' };
  if (b.modus === 'kvittering') return { butikk: 'Rema 1000 Finnsnes', dato: d(0), total: 132.4, linjer: [
    { tekst: 'TINE LETTMELK 1L', vare: 'Lettmelk', kategori: 'meieri', antall: 4, pris: 87.6, type: 'mat', lagringssted: 'kjoleskap', holdbarhet_dager: 8, kurv_id: 'kv1', sikker: true },
    { tekst: 'AGURK', vare: 'Agurk', kategori: 'frukt_gront', antall: 1, pris: 19.9, type: 'mat', lagringssted: 'kjoleskap', holdbarhet_dager: 7, kurv_id: null, sikker: true },
    { tekst: 'BÆREPOSE', vare: 'Bærepose', antall: 1, pris: 4.5, type: 'pose' } ] };
  return { vare: 'Nugatti Original', merke: 'Orkla', kategori: 'palegg', ean: '7021010001057', pakning_mengde: 500, pakning_enhet: 'g', andel_igjen: 1, holdbarhet: null, lagringssted: 'skap', vekt_g: 521 };
}
export async function lastOppBilde() { return null; }
