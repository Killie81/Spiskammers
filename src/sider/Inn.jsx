import { useEffect, useState } from 'react';
import { supabase, rpc, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, lesStrekkode, tilBase64 } from '../bilde.js';
import { holdbarTekst, kr, leggTilDager, andelFraVekt, nettoAv, gjettStykkvis, gjettAvdeling } from '../format.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';
import Kvittering from './Kvittering.jsx';
import Ikon from '../deler/Ikon.jsx';
import StedVelger from '../deler/StedVelger.jsx';
import ProsentVelger from '../deler/ProsentVelger.jsx';

const TOM = { vare: '', merke: '', ean: '', kategori: 'annet', pakning_mengde: '', pakning_enhet: 'stk', andel: 1, holdbarhet: '', dato_type: 'best_for', lagringssted: 'kjoleskap', antall: 1, stykkvis: false };

export default function Inn({ husstand, vis, gåTil, startModus = 'vare' }) {
  const [modus, setModus] = useState(startModus);
  const [fase, setFase] = useState('start'); // start | leser | skjema
  const [v, setV] = useState(TOM);
  const [bilde, setBilde] = useState(null);
  const [blob, setBlob] = useState(null);
  const [fotoAndel, setFotoAndel] = useState(null);
  const [datoLest, setDatoLest] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  // Vekt: veid vekt, kjent emballasje for produktet, og hvordan emballasjen skal finnes for nye produkter.
  const [vekt, setVekt] = useState('');
  const [kjent, setKjent] = useState(null);          // { tara_g, netto_g, beholder }
  const [full, setFull] = useState(null);            // true | false | null (ikke svart)
  const [metodeIkkeFull, setMetodeIkkeFull] = useState('anslag'); // anslag | emballasje | beholder
  const [emballasje, setEmballasje] = useState('');
  const [fotoEmb, setFotoEmb] = useState(null);       // { materiale, anslag_g } fra bildet
  const [beholdere, setBeholdere] = useState([]);
  const [beholder, setBeholder] = useState('');      // id, eller 'ny'
  const [nyBeholder, setNyBeholder] = useState({ navn: '', vekt: '' });

  const [poser, setPoser] = useState(null);
  useEffect(() => {
    supabase.from('utgift').select('belop, antall').eq('type', 'pose').gte('dato', leggTilDager(null, -365))
      .then(({ data }) => setPoser({ kr: (data || []).reduce((a, u) => a + Number(u.belop), 0), stk: (data || []).reduce((a, u) => a + (u.antall || 1), 0) }));
  }, [modus]);
  useEffect(() => { supabase.from('beholder').select('id, navn, vekt_g').order('navn').then(({ data }) => setBeholdere(data || [])); }, []);

  // Finn kjent emballasjevekt for produktet (samme strekkode, ellers samme navn).
  async function finnKjent(ean, navn) {
    let q = supabase.from('produkt').select('emballasje_g, pakning_mengde, pakning_enhet, beholder:beholder_id(navn, vekt_g)').limit(1);
    q = ean ? q.eq('ean', ean) : q.ilike('navn', navn || '');
    const { data } = await q;
    const p = data && data[0];
    if (!p) return null;
    const tara = p.beholder?.vekt_g ?? p.emballasje_g;
    return tara != null ? { tara_g: Number(tara), netto_g: nettoAv(p.pakning_mengde, p.pakning_enhet), beholder: p.beholder?.navn } : null;
  }

  const sett = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const nullstill = () => { setFase('start'); setV(TOM); setBilde(null); setBlob(null); setFotoAndel(null); setDatoLest(false); setVekt(''); setKjent(null); setFull(null); setEmballasje(''); setFotoEmb(null); setBeholder(''); setNyBeholder({ navn: '', vekt: '' }); };

  async function påBilde(fil) {
    setFase('leser'); setBilde(URL.createObjectURL(fil));
    try {
      const { blob: b, canvas } = await krympBilde(fil);
      setBlob(b);
      const ean = await lesStrekkode(canvas);
      const r = await spørClaude({ modus: 'vare', bilde: await tilBase64(b), ean, beholdere: beholdere.map(({ navn, vekt_g }) => ({ navn, vekt_g })) });
      const dato = typeof r.holdbarhet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.holdbarhet) ? r.holdbarhet : '';
      const andel = typeof r.andel_igjen === 'number' ? Math.round(r.andel_igjen * 20) / 20 : 1;
      setFotoAndel(typeof r.andel_igjen === 'number' && r.andel_igjen < 0.95 ? andel : null);
      setDatoLest(Boolean(dato));
      if (r.vekt_g > 0) setVekt(String(Math.round(r.vekt_g)));
      // Emballasje gjenkjent på bildet: standardbeholder velges, ellers foreslås anslått vekt.
      const emb = r.emballasje && Number(r.emballasje.anslag_g) > 0 ? { materiale: r.emballasje.materiale, anslag_g: Math.round(r.emballasje.anslag_g) } : null;
      setFotoEmb(emb);
      if (emb) setEmballasje(String(emb.anslag_g));
      const treff = r.beholder && beholdere.find((x) => x.navn.toLowerCase() === String(r.beholder).toLowerCase());
      if (treff) { setMetodeIkkeFull('beholder'); setBeholder(treff.id); setFull(false); }
      setKjent(await finnKjent(ean || r.ean, r.vare).catch(() => null));
      setV({
        ...TOM, vare: r.vare || '', merke: r.merke || '', ean: ean || r.ean || '', kategori: String(r.kategori || 'annet').split(/[\s(]/)[0],
        pakning_mengde: r.pakning_mengde ?? '', pakning_enhet: r.pakning_enhet || 'stk', andel: andel >= 0.95 ? 1 : andel,
        holdbarhet: dato, dato_type: r.dato_type || 'best_for', lagringssted: r.lagringssted || 'kjoleskap',
        stykkvis: Boolean(r.stykkvis) || gjettStykkvis(r.vare), antall: Math.max(1, Math.min(99, parseInt(r.antall_stk, 10) || 1)),
      });
      setFase('skjema');
    } catch (e) {
      vis(`Bildet kunne ikke leses: ${e.message}`);
      setFase('start');
    }
  }

  async function lagre() {
    if (!v.vare.trim()) { vis('Varen trenger et navn'); return; }
    setLagrer(true);
    try {
      const sti = await lastOppBilde(husstand.id, blob, 'inn');
      const veid = !v.stykkvis && Number(vekt) > 0 ? Number(vekt) : null;
      const andelInn = v.stykkvis ? 1 : veid && kjentAndel != null ? kjentAndel : (veid && full && metodeIkkeFull !== 'beholder' ? 1 : v.andel);
      const ider = await rpc('registrer_inn', {
        p_navn: v.vare.trim(), p_merke: v.merke || null, p_ean: v.ean || null, p_kategori: v.kategori === 'annet' ? gjettAvdeling(v.vare) : v.kategori,
        p_mengde: v.stykkvis ? 1 : v.pakning_mengde === '' ? null : Number(v.pakning_mengde), p_enhet: v.stykkvis ? 'stk' : v.pakning_enhet, p_sted: v.lagringssted,
        p_antall: v.antall, p_andel: andelInn, p_holdbarhet: v.holdbarhet || null, p_dato_type: v.holdbarhet ? v.dato_type : null,
        p_pris: null, p_kvittering: null, p_metode: blob ? (v.ean ? 'strekkode' : 'foto') : 'manuelt', p_bilde: sti,
      });
      if (ider?.length) await rpc('sett_stykkvis', { p_pakning: ider[0], p_verdi: v.stykkvis });
      // Lær emballasjevekten fra veiingen (bare den første pakningen står på vekta).
      let info = '';
      if (veid && kjentAndel == null && full != null && ider?.length) {
        let bid = null, emb = null, andelLær = metodeIkkeFull === 'beholder' || !full ? v.andel : 1;
        if (!full && metodeIkkeFull === 'emballasje') emb = Number(emballasje);
        if (bruktBeholder) {
          bid = beholder === 'ny' ? await rpc('lagre_beholder', { p_navn: nyBeholder.navn, p_vekt_g: Number(nyBeholder.vekt) }) : beholder;
        }
        const r = await rpc('laer_emballasje', { p_pakning: ider[0], p_vekt_g: veid, p_andel: andelLær, p_emballasje_g: emb, p_beholder: bid });
        info = ` · emballasje ${Math.round(r.tara_g)} g, ${Math.round(r.andel * 100)} % igjen`;
      } else if (veid && kjentAndel != null) {
        info = ` · ${Math.round(kjentAndel * 100)} % igjen (veid)`;
      }
      vis(v.stykkvis ? `${v.antall} stk ${v.vare} lagt inn` : `${v.antall > 1 ? `${v.antall} × ` : ''}${v.vare} lagt inn${info}`);
      nullstill();
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
    }
    setLagrer(false);
  }

  const veidTall = Number(vekt) > 0 ? Number(vekt) : null;
  const netto = nettoAv(Number(v.pakning_mengde), v.pakning_enhet);
  const kjentAndel = veidTall && kjent ? andelFraVekt(veidTall, kjent.tara_g, kjent.netto_g ?? netto) : null;
  const bruktBeholder = metodeIkkeFull === 'beholder' && beholder;
  const valgtBeholderVekt = beholder === 'ny' ? Number(nyBeholder.vekt) : beholdere.find((b) => b.id === beholder)?.vekt_g;
  // Forhåndsvisning av resultatet før lagring
  let forhånd = null;
  if (veidTall && kjentAndel == null && full != null) {
    if (metodeIkkeFull === 'beholder' && valgtBeholderVekt) {
      forhånd = netto ? `${Math.round(Math.max(0, (veidTall - valgtBeholderVekt) / netto) * 100)} % igjen` : `Innhold nå ${Math.round(veidTall - valgtBeholderVekt)} g`;
    } else if (full) {
      forhånd = netto ? `Emballasje ${Math.round(veidTall - netto)} g` : 'Mangler nettovekt – fyll inn pakningsstørrelse';
    } else if (metodeIkkeFull === 'emballasje' && Number(emballasje) >= 0 && emballasje !== '') {
      forhånd = netto ? `${Math.round(Math.max(0, (veidTall - Number(emballasje)) / netto) * 100)} % igjen` : null;
    } else if (metodeIkkeFull === 'anslag') {
      forhånd = netto ? `Emballasje ca. ${Math.round(veidTall - netto * v.andel)} g` : 'Mangler nettovekt – fyll inn pakningsstørrelse';
    }
  }

  return (
    <section className="inn">
      {poser && (
        <div className="posepåminner">
          <Ikon navn="pose" størrelse={26} />
          <div>
            <b>{kr(poser.kr)} kr på bæreposer siste år</b>
            <span>{poser.stk ? `${poser.stk} poser. ` : ''}Husk handlenettet neste gang!</span>
          </div>
        </div>
      )}
      <div className="bryter">
        <button type="button" className={modus === 'vare' ? 'på' : ''} onClick={() => setModus('vare')}><Ikon navn="boks" størrelse={18} /> Vare</button>
        <button type="button" className={modus === 'kvittering' ? 'på' : ''} onClick={() => setModus('kvittering')}><Ikon navn="kvittering" størrelse={18} /> Kvittering</button>
      </div>

      {modus === 'kvittering' && <Kvittering husstand={husstand} vis={vis} gåTil={gåTil} />}

      {modus === 'vare' && fase === 'start' && (
        <div className="kolonne">
          <Fotoknapp tekst="Ta bilde av varen" undertekst="Strekkode, dato og mengde leses automatisk" onFil={påBilde} />
          <div className="to-knapper"><Fotoknapp tekst="Velg fra albumet" onFil={påBilde} kamera={false} klasse="sekundær" ikon="bilde" />
          <button type="button" className="sekundær" onClick={() => setFase('skjema')}><Ikon navn="inn" størrelse={20} /> Uten bilde</button></div>
        </div>
      )}

      {modus === 'vare' && fase === 'leser' && (
        <div className="kolonne">
          <div className="forhånd"><img src={bilde} alt="Bilde av varen" /></div>
          <p className="midt"><span className="spinn" /> Leser varen …</p>
        </div>
      )}

      {modus === 'vare' && fase === 'skjema' && (
        <div className="rad">
          {bilde && <div className="forhånd liten"><img src={bilde} alt="Bilde av varen" /></div>}
          <div className="kort skjema">
            <label>Vare<input value={v.vare} onChange={(e) => { sett('vare', e.target.value); if (gjettStykkvis(e.target.value)) sett('stykkvis', true); }} /></label>
            <label className="avkryss"><input type="checkbox" checked={v.stykkvis} onChange={(e) => sett('stykkvis', e.target.checked)} />
              <span>Telles i stk<small>Frukt o.l. som tas ut én og én – ikke i prosent</small></span></label>
            {!v.stykkvis && <div className="to">
              <label>Pakning<input inputMode="decimal" value={v.pakning_mengde} onChange={(e) => sett('pakning_mengde', e.target.value.replace(',', '.'))} /></label>
              <label>Enhet<select value={v.pakning_enhet} onChange={(e) => sett('pakning_enhet', e.target.value)}>
                <option value="ml">ml</option><option value="g">g</option><option value="stk">stk</option></select></label>
            </div>}
            <span className="etikett">{v.stykkvis ? 'Antall stk' : 'Antall like pakninger'}</span>
            <div className="teller">
              <button type="button" aria-label="Færre" onClick={() => sett('antall', Math.max(1, v.antall - 1))}>−</button>
              <b>{v.antall}</b>
              <button type="button" aria-label="Flere" onClick={() => sett('antall', Math.min(99, v.antall + 1))}>+</button>
            </div>
            {!v.stykkvis && <div className="vektboks">
              <label>Veid på kjøkkenvekta (g)
                <input inputMode="decimal" placeholder="Valgfritt" value={vekt} onChange={(e) => { setVekt(e.target.value.replace(',', '.')); }} /></label>
              {veidTall && kjentAndel != null && (
                <p className="vektsvar"><b>{Math.round(kjentAndel * 100)} % igjen</b> · kjent {kjent.beholder ? `beholder (${kjent.beholder})` : 'emballasje'} {Math.round(kjent.tara_g)} g</p>
              )}
              {veidTall && kjentAndel == null && (
                <>
                  <span className="etikett">Ny vare på vekta – er pakken full?</span>
                  <div className="valg">
                    <button type="button" className={full === true && metodeIkkeFull !== 'beholder' ? 'på' : ''} onClick={() => { setFull(true); setMetodeIkkeFull('anslag'); setBeholder(''); }}>Ja, full</button>
                    <button type="button" className={full === false && metodeIkkeFull !== 'beholder' ? 'på' : ''} onClick={() => { setFull(false); setMetodeIkkeFull(fotoEmb ? 'emballasje' : 'anslag'); setBeholder(''); sett('andel', fotoAndel ?? 0.5); }}>Nei</button>
                    <button type="button" className={metodeIkkeFull === 'beholder' ? 'på' : ''} onClick={() => { setFull(full ?? true); setMetodeIkkeFull('beholder'); }}>Beholder</button>
                  </div>
                  {full === false && metodeIkkeFull !== 'beholder' && (
                    <div className="bryter liten">
                      <button type="button" className={metodeIkkeFull === 'anslag' ? 'på' : ''} onClick={() => setMetodeIkkeFull('anslag')}>Anslå hvor mye som er igjen</button>
                      <button type="button" className={metodeIkkeFull === 'emballasje' ? 'på' : ''} onClick={() => setMetodeIkkeFull('emballasje')}>{fotoEmb ? 'Emballasje fra bildet' : 'Oppgi emballasjevekt'}</button>
                    </div>
                  )}
                  {full === false && metodeIkkeFull === 'emballasje' && (
                    <label>Emballasjevekt (g){fotoEmb && <small className="dempet"> – anslått fra bildet ({fotoEmb.materiale}), rett hvis du vet bedre</small>}<input inputMode="decimal" value={emballasje} onChange={(e) => setEmballasje(e.target.value.replace(',', '.'))} /></label>
                  )}
                  {metodeIkkeFull === 'beholder' && (
                    <div className="skjema">
                      <label>Beholder
                        <select value={beholder} onChange={(e) => setBeholder(e.target.value)}>
                          <option value="">Velg …</option>
                          {beholdere.map((b) => <option key={b.id} value={b.id}>{b.navn} ({Math.round(b.vekt_g)} g)</option>)}
                          <option value="ny">Ny beholder …</option>
                        </select></label>
                      {beholder === 'ny' && (
                        <div className="to">
                          <label>Navn<input placeholder="Krydderglass" value={nyBeholder.navn} onChange={(e) => setNyBeholder({ ...nyBeholder, navn: e.target.value })} /></label>
                          <label>Tom vekt (g)<input inputMode="decimal" value={nyBeholder.vekt} onChange={(e) => setNyBeholder({ ...nyBeholder, vekt: e.target.value.replace(',', '.') })} /></label>
                        </div>
                      )}
                    </div>
                  )}
                  {forhånd && <p className="vektsvar">{forhånd}</p>}
                </>
              )}
            </div>}
            {!v.stykkvis && !(veidTall && kjentAndel != null) && !(veidTall && full === true && metodeIkkeFull !== 'beholder') && !(veidTall && full === false && metodeIkkeFull === 'emballasje') && !(veidTall && metodeIkkeFull === 'beholder' && netto) && (
              <ProsentVelger verdi={v.andel} onEndre={(x) => sett('andel', x)}
                etikett={metodeIkkeFull === 'beholder' && veidTall ? 'Hvor fullt er beholderen?' : `Hvor mye er igjen?${fotoAndel != null ? ' (anslått fra bildet)' : ''}`} />
            )}
            <span className="etikett">Lagringssted</span>
            <StedVelger valgt={v.lagringssted} onVelg={(id) => sett('lagringssted', id)} />
            <div className="to">
              <label>{v.dato_type === 'siste_forbruksdag' ? 'Siste forbruksdag' : 'Best før'}
                <input type="date" value={v.holdbarhet} onChange={(e) => { sett('holdbarhet', e.target.value); setDatoLest(false); }} /></label>
              <label>Datotype<select value={v.dato_type} onChange={(e) => sett('dato_type', e.target.value)}>
                <option value="best_for">Best før</option><option value="siste_forbruksdag">Siste forbruksdag</option></select></label>
            </div>
            <p className="dempet">{v.holdbarhet ? `${holdbarTekst(v.holdbarhet)}${datoLest ? ' · lest fra pakningen' : ''}` : 'Ingen dato – legg inn hvis den finnes.'}</p>
            <div className="valg">
              <button type="button" className="primær" disabled={lagrer} onClick={lagre}>{lagrer ? 'Lagrer …' : 'Legg inn'}</button>
              <button type="button" className="lenke" onClick={nullstill}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
