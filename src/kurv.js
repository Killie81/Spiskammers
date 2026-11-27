// Handlekurven: varer fotografert i butikken venter her til kvitteringen er scannet.
import { supabase, rpc, spørClaude, lastOppBilde } from './supabase.js';
import { krympBilde, lesStrekkode, tilBase64 } from './bilde.js';
import { gjettStykkvis } from './format.js';

export async function hentKurv() {
  const { data, error } = await supabase.from('kurv_vare').select('*').eq('status', 'i_kurv').order('opprettet');
  if (error) throw new Error(error.message);
  return data || [];
}

// Fotografer en vare i handlevogna. «vare» er raden på handlelisten, eller null for en vare utenfor listen.
export async function fotograferTilKurv(fil, husstand, vare) {
  const { blob, canvas } = await krympBilde(fil);
  const [ean, sti] = await Promise.all([lesStrekkode(canvas).catch(() => null), lastOppBilde(husstand.id, blob, 'kurv')]);
  const r = await spørClaude({ modus: 'vare', bilde: await tilBase64(blob), ean });
  const dato = typeof r.holdbarhet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.holdbarhet) ? r.holdbarhet : null;
  const stykk = Boolean(r.stykkvis) || gjettStykkvis(r.vare);
  const rad = {
    husstand_id: husstand.id,
    handleliste_id: vare?.id ?? null,
    navn: r.vare || vare?.navn || 'Ukjent vare',
    merke: r.merke || null,
    ean: ean || r.ean || null,
    kategori: String(r.kategori || 'annet').split(/[\s(]/)[0],
    pakning_mengde: stykk ? 1 : r.pakning_mengde ?? null,
    pakning_enhet: stykk ? 'stk' : r.pakning_enhet || 'stk',
    holdbarhet: dato,
    dato_type: dato ? r.dato_type || 'best_for' : null,
    lagringssted: r.lagringssted || 'skap',
    antall: Math.max(1, stykk ? parseInt(r.antall_stk, 10) || vare?.antall || 1 : vare?.antall || 1),
    stykkvis: stykk,
    bilde_sti: sti,
    impuls: !vare,
  };
  // Et nytt bilde av samme vare på listen erstatter det forrige.
  if (vare) await supabase.from('kurv_vare').delete().eq('handleliste_id', vare.id).eq('status', 'i_kurv');
  const { data, error } = await supabase.from('kurv_vare').insert(rad).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fjernFraKurv(k) {
  const { error } = await supabase.from('kurv_vare').delete().eq('id', k.id);
  if (error) throw new Error(error.message);
}

// Legg en kurvvare i lageret. Bildet gir vare, størrelse og dato; kvitteringen (om den finnes) gir antall og pris.
export async function leggKurvILager(k, { antall, pris, sted, kvittering, holdbarhet } = {}) {
  const dato = k.holdbarhet || holdbarhet || null;
  const ider = await rpc('registrer_inn', {
    p_navn: k.navn, p_merke: k.merke, p_ean: k.ean, p_kategori: k.kategori || 'annet',
    p_mengde: k.pakning_mengde, p_enhet: k.pakning_enhet || 'stk', p_sted: sted || k.lagringssted || 'skap',
    p_antall: antall || k.antall, p_andel: 1,
    p_holdbarhet: dato, p_dato_type: k.holdbarhet ? k.dato_type || 'best_for' : dato ? 'anslag' : null,
    p_pris: typeof pris === 'number' ? pris : null, p_kvittering: kvittering || null, p_metode: 'foto', p_bilde: k.bilde_sti,
  });
  if (k.stykkvis && ider?.length) await rpc('sett_stykkvis', { p_pakning: ider[0], p_verdi: true });
  if (typeof pris === 'number') await supabase.from('kurv_vare').update({ pris }).eq('id', k.id);
  await rpc('avslutt_kurv', { p_kurv: k.id, p_status: 'lagret', p_kvittering: kvittering || null });
  return antall || k.antall;
}

export const kurvTekst = (k) => [
  k.merke && !k.navn.toLowerCase().includes(k.merke.toLowerCase()) ? `${k.merke} ${k.navn}` : k.navn,
  k.pakning_mengde && k.pakning_enhet !== 'stk' ? `${String(k.pakning_mengde).replace('.', ',')} ${k.pakning_enhet}` : null,
  k.holdbarhet ? `best før ${new Date(k.holdbarhet).toLocaleDateString('nb-NO', { day: 'numeric', month: 'numeric' })}` : null,
].filter(Boolean).join(' · ');
