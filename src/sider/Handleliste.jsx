import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, rpc, hentLager } from '../supabase.js';
import { AVDELINGER, avdelingNavn, avdelingRekke, gjettAvdeling, grupper, nesteHandledag, stedNavn } from '../format.js';
import Ikon from '../deler/Ikon.jsx';
import { hentKurv, fotograferTilKurv, fjernFraKurv, kurvTekst } from '../kurv.js';

// Lite kameraikon på raden: bildet tas i handlevogna og leses av Claude.
function KurvFoto({ onFil, laster, etikett, stor }) {
  return (
    <label className={`hrad-foto${laster ? ' laster' : ''}`} aria-label={etikett}>
      <input type="file" accept="image/*" capture="environment" disabled={laster}
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFil(f); }} />
      {laster ? <span className="spinn" /> : <Ikon navn="kamera" størrelse={stor ? 26 : 20} />}
    </label>
  );
}

const KILDE = { forslag: 'Forslag', fast: 'Fast', manuell: 'Lagt til', oppskrift: 'Oppskrift' };

export default function Handleliste({ husstand, vis, gåTil }) {
  const [varer, setVarer] = useState(null);
  const [lager, setLager] = useState([]);
  const [ny, setNy] = useState('');
  const [nyAntall, setNyAntall] = useState(1);
  const [harVi, setHarVi] = useState(null); // treff på lager før vi legger til
  const [åpen, setÅpen] = useState(null);   // rad med handlinger synlig
  const [tur, setTur] = useState(false);
  const [ferdig, setFerdig] = useState(false);
  const [oppdaterer, setOppdaterer] = useState(false);
  const [kurv, setKurv] = useState([]);
  const [laster, setLaster] = useState({}); // rad-id (eller 'ekstra') → bildet leses

  const last = useCallback(async () => {
    const [{ data, error }, l, k] = await Promise.all([
      supabase.from('handleliste_vare').select('*').eq('status', 'aktiv').order('opprettet'),
      hentLager().catch(() => []),
      hentKurv().catch(() => []),
    ]);
    if (error) vis(error.message); else setVarer(data);
    setLager(l);
    setKurv(k);
  }, [vis]);

  useEffect(() => {
    last();
    const påFokus = () => { if (document.visibilityState === 'visible') last(); };
    document.addEventListener('visibilitychange', påFokus);
    return () => document.removeEventListener('visibilitychange', påFokus);
  }, [last]);

  const endre = (id, felt) => setVarer((vs) => vs.map((v) => (v.id === id ? { ...v, ...felt } : v)));

  async function oppdater(id, felt) {
    endre(id, felt);
    const { error } = await supabase.from('handleliste_vare').update(felt).eq('id', id);
    if (error) { vis(`Kunne ikke lagre: ${error.message}`); last(); }
  }

  const kurvFor = (id) => kurv.find((k) => k.handleliste_id === id);
  const ekstra = kurv.filter((k) => !k.handleliste_id);

  async function kryss(v) {
    await oppdater(v.id, { avkrysset: !v.avkrysset, avkrysset_tid: v.avkrysset ? null : new Date().toISOString() });
    // Tas varen ut av kurven, forsvinner også bildet av den.
    const k = v.avkrysset && kurvFor(v.id);
    if (k) { await fjernFraKurv(k).catch(() => {}); setKurv((ks) => ks.filter((x) => x.id !== k.id)); }
  }

  // Bilde i handlevogna: varen krysses av og legges i kurven med navn, størrelse og dato.
  async function foto(v, fil) {
    const nøkkel = v ? v.id : 'ekstra';
    setLaster((l) => ({ ...l, [nøkkel]: true }));
    try {
      const k = await fotograferTilKurv(fil, husstand, v);
      if (v && !v.avkrysset) await oppdater(v.id, { avkrysset: true, avkrysset_tid: new Date().toISOString() });
      setKurv((ks) => [...ks.filter((x) => !(v && x.handleliste_id === v.id)), k]);
      vis(`I kurven: ${kurvTekst(k)}`);
    } catch (e) {
      vis(`Bildet kunne ikke leses: ${e.message}`);
    }
    setLaster((l) => ({ ...l, [nøkkel]: false }));
  }

  async function fjernEkstra(k) {
    try { await fjernFraKurv(k); setKurv((ks) => ks.filter((x) => x.id !== k.id)); vis(`${k.navn} tatt ut av kurven`); }
    catch (e) { vis(e.message); }
  }

  async function fjern(v) {
    setVarer((vs) => vs.filter((x) => x.id !== v.id));
    const { error } = await supabase.from('handleliste_vare').update({ status: 'fjernet' }).eq('id', v.id);
    if (error) { vis(error.message); last(); return; }
    vis(`${v.navn} fjernet`, async () => { await supabase.from('handleliste_vare').update({ status: 'aktiv' }).eq('id', v.id); last(); });
  }

  async function fast(v) {
    try {
      await rpc('sett_fast', { p_vare: v.id, p_fast: v.kilde !== 'fast' });
      vis(v.kilde === 'fast' ? `${v.navn} er ikke lenger fast` : `${v.navn} kommer nå på listen hver torsdag`);
      last();
    } catch (e) { vis(e.message); }
  }

  // «Har vi dette?» – sjekk lageret før varen legges til.
  function påLeggTil(e) {
    e.preventDefault();
    const navn = ny.trim();
    if (!navn) return;
    const n = navn.toLowerCase();
    const treff = grupper(lager).filter((p) => p.navn.toLowerCase().includes(n) || n.includes(p.navn.toLowerCase()));
    if (treff.length && !harVi) { setHarVi(treff); return; }
    leggTil(navn);
  }

  async function leggTil(navn) {
    try {
      await rpc('legg_til_handleliste', { p_navn: navn, p_antall: nyAntall, p_avdeling: gjettAvdeling(navn) });
      setNy(''); setNyAntall(1); setHarVi(null);
      last();
    } catch (e) { vis(e.message); }
  }

  async function oppdaterForslag() {
    setOppdaterer(true);
    try { const n = await rpc('oppdater_min_handleliste'); vis(n ? `${n} varer foreslått` : 'Ingen nye forslag akkurat nå'); last(); }
    catch (e) { vis(e.message); }
    setOppdaterer(false);
  }

  if (!varer) return <p className="midt"><span className="spinn" /></p>;

  const flagget = varer.filter((v) => v.kontroll === 'ikke_pa_kvittering');
  const vanlige = varer.filter((v) => v.kontroll !== 'ikke_pa_kvittering');
  const igjen = vanlige.filter((v) => !v.avkrysset).length;
  const neste = nesteHandledag(husstand.handledag ?? 4, husstand.handletime ?? 14)
    .toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });
  const avdelinger = [...new Set(vanlige.map((v) => v.avdeling))].sort((a, b) => avdelingRekke(a) - avdelingRekke(b));

  const rad = (v, stor = false) => (
    <li key={v.id} className={`hrad${v.avkrysset ? ' tatt' : ''}${stor ? ' stor' : ''}`}>
      <button type="button" className="hrad-hoved" onClick={() => kryss(v)} aria-pressed={v.avkrysset}>
        <span className="sjekkboks">{v.avkrysset && <Ikon navn="sjekk" størrelse={stor ? 26 : 20} />}</span>
        <span className="hrad-tekst">
          <b>{v.navn}{v.antall > 1 && <span className="antall"> × {v.antall}</span>}</b>
          {kurvFor(v.id)
            ? <small className="kurvinfo"><Ikon navn="kamera" størrelse={13} /> {kurvTekst(kurvFor(v.id))}</small>
            : !stor && v.begrunnelse && <small>{v.begrunnelse}</small>}
        </span>
        {!stor && <span className={`kilde kilde-${v.kilde}`}>{v.kilde === 'fast' && <Ikon navn="stjerne" størrelse={12} />}{KILDE[v.kilde]}</span>}
      </button>
      <KurvFoto stor={stor} laster={laster[v.id]} etikett={`Ta bilde av ${v.navn}`} onFil={(f) => foto(v, f)} />
      {!stor && (
        <button type="button" className="hrad-mer" aria-label={`Valg for ${v.navn}`} aria-expanded={åpen === v.id}
          onClick={() => setÅpen(åpen === v.id ? null : v.id)}><Ikon navn="prikker" størrelse={20} /></button>
      )}
      {!stor && åpen === v.id && (
        <div className="hrad-valg">
          <div className="teller liten">
            <button type="button" aria-label="Færre" onClick={() => v.antall > 1 && oppdater(v.id, { antall: v.antall - 1 })}>−</button>
            <b>{v.antall}</b>
            <button type="button" aria-label="Flere" onClick={() => oppdater(v.id, { antall: v.antall + 1 })}>+</button>
          </div>
          <select value={v.avdeling} aria-label="Avdeling" onChange={(e) => oppdater(v.id, { avdeling: e.target.value })}>
            {AVDELINGER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <button type="button" className={v.kilde === 'fast' ? 'på' : ''} onClick={() => fast(v)}><Ikon navn="stjerne" størrelse={18} /> {v.kilde === 'fast' ? 'Fast' : 'Gjør fast'}</button>
          <button type="button" className="kastet" onClick={() => fjern(v)}><Ikon navn="kryss" størrelse={18} /> Fjern</button>
        </div>
      )}
    </li>
  );

  return (
    <section className="handleliste">
      <div className="handle-hode">
        <div>
          <p className="dato">Neste handel {neste} · {igjen} {igjen === 1 ? 'vare' : 'varer'}</p>
          <h1>Handleliste</h1>
        </div>
        <button type="button" className="sekundær liten" onClick={oppdaterForslag} disabled={oppdaterer}>
          <Ikon navn="oppdater" størrelse={18} /> {oppdaterer ? 'Beregner …' : 'Oppdater forslag'}
        </button>
      </div>

      {kurv.length > 0 && !ferdig && (
        <div className="banner rolig">
          <Ikon navn="kurv" størrelse={22} />
          <span><b>{kurv.length} {kurv.length === 1 ? 'vare' : 'varer'} i kurven</b> venter på kvitteringen.</span>
          <button type="button" className="primær" onClick={() => gåTil('inn', 'kvittering')}>Kvittering</button>
        </div>
      )}

      {ferdig && (
        <div className="banner rolig">
          <Ikon navn="kvittering" størrelse={22} />
          <span><b>Handleturen er ferdig.</b> Registrer kvitteringen, så avstemmes listen mot det dere faktisk kjøpte.</span>
          <button type="button" className="primær" onClick={() => gåTil('inn', 'kvittering')}>Kvittering</button>
        </div>
      )}

      {flagget.length > 0 && (
        <div className="kort flagget">
          <h3>Krysset av, men ikke funnet på kvitteringen</h3>
          <ul className="flagliste">
            {flagget.map((v) => (
              <li key={v.id}>
                <span><b>{v.navn}</b>{v.antall > 1 && <span className="antall"> × {v.antall}</span>}</span>
                <span className="valg">
                  <button type="button" onClick={() => oppdater(v.id, { status: 'kjopt', kontroll: null })}>Kjøpt likevel</button>
                  <button type="button" onClick={() => oppdater(v.id, { avkrysset: false, avkrysset_tid: null, kontroll: null })}>Ikke kjøpt</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="legg-til" onSubmit={påLeggTil}>
        <input value={ny} onChange={(e) => { setNy(e.target.value); setHarVi(null); }} placeholder="Legg til vare …" aria-label="Ny vare" enterKeyHint="done" />
        <div className="teller liten">
          <button type="button" aria-label="Færre" onClick={() => setNyAntall(Math.max(1, nyAntall - 1))}>−</button>
          <b>{nyAntall}</b>
          <button type="button" aria-label="Flere" onClick={() => setNyAntall(nyAntall + 1)}>+</button>
        </div>
        <button type="submit" className="primær" aria-label="Legg til"><Ikon navn="inn" størrelse={22} /></button>
      </form>
      {harVi && (
        <div className="harvi">
          <span><b>Dere har allerede:</b> {harVi.slice(0, 3).map((p) => `${p.antall > 1 ? `${p.antall} × ` : ''}${p.navn} (${stedNavn(p.sted)})`).join(', ')}</span>
          <span className="valg">
            <button type="button" onClick={() => leggTil(ny.trim())}>Legg til likevel</button>
            <button type="button" className="lenke" onClick={() => { setHarVi(null); setNy(''); }}>Avbryt</button>
          </span>
        </div>
      )}

      <label className={`impulsknapp${laster.ekstra ? ' laster' : ''}`}>
        <input type="file" accept="image/*" capture="environment" disabled={laster.ekstra}
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) foto(null, f); }} />
        <span className="impuls-ikon">{laster.ekstra ? <span className="spinn" /> : <Ikon navn="kamera" størrelse={24} />}</span>
        <span><b>Impulskjøp</b><small>Ta bilde av en vare som ikke står på listen</small></span>
      </label>

      {vanlige.length > 0 && (
        <button type="button" className="kamera tur-knapp" onClick={() => { setTur(true); setÅpen(null); }}>
          <span className="knapp-ikon"><Ikon navn="kurv" størrelse={30} /></span>
          <span className="knapp-tekst"><span>Start handletur</span><small>Store linjer, skjermen holdes på</small></span>
        </button>
      )}

      {avdelinger.map((a) => (
        <div key={a} className="avdeling">
          <h3>{avdelingNavn(a)}</h3>
          <ul className="hliste">{vanlige.filter((v) => v.avdeling === a).map((v) => rad(v))}</ul>
        </div>
      ))}
      {ekstra.length > 0 && (
        <div className="avdeling">
          <h3>Impulskjøp i kurven</h3>
          <ul className="hliste">{ekstra.map((k) => <EkstraRad key={k.id} k={k} onFjern={fjernEkstra} />)}</ul>
        </div>
      )}
      {!varer.length && <p className="tomt">Listen er tom. Forslag kommer torsdag kl. 14, eller trykk «Oppdater forslag».</p>}

      {tur && <Handletur varer={vanlige} rad={rad} ekstra={ekstra} onFjernEkstra={fjernEkstra}
        laster={laster.ekstra} onImpuls={(f) => foto(null, f)} onFerdig={() => { setTur(false); setFerdig(true); last(); }} onLukk={() => setTur(false)} />}
    </section>
  );
}

// Fullskjerm i butikken: store linjer, avkryssede nederst, skjermen holdes på.
function EkstraRad({ k, onFjern, stor }) {
  return (
    <li className={`hrad tatt ekstra${stor ? ' stor' : ''}`}>
      <div className="hrad-hoved">
        <span className="sjekkboks"><Ikon navn="kamera" størrelse={stor ? 22 : 18} /></span>
        <span className="hrad-tekst"><b>{k.navn}{k.antall > 1 && <span className="antall"> × {k.antall}</span>}</b><small className="kurvinfo">{kurvTekst(k)}</small></span>
      </div>
      <button type="button" className="hrad-mer" aria-label={`Ta ${k.navn} ut av kurven`} onClick={() => onFjern(k)}><Ikon navn="kryss" størrelse={20} /></button>
    </li>
  );
}

function Handletur({ varer, rad, ekstra, onFjernEkstra, laster, onImpuls, onFerdig, onLukk }) {
  const lås = useRef(null);
  useEffect(() => {
    (async () => { try { lås.current = await navigator.wakeLock?.request('screen'); } catch { /* ikke støttet */ } })();
    const gjenoppta = async () => { if (document.visibilityState === 'visible' && lås.current?.released) { try { lås.current = await navigator.wakeLock.request('screen'); } catch { /* */ } } };
    document.addEventListener('visibilitychange', gjenoppta);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('visibilitychange', gjenoppta); lås.current?.release?.(); document.body.style.overflow = ''; };
  }, []);

  const igjen = varer.filter((v) => !v.avkrysset);
  const tatt = varer.filter((v) => v.avkrysset);
  const avdelinger = [...new Set(igjen.map((v) => v.avdeling))].sort((a, b) => avdelingRekke(a) - avdelingRekke(b));

  return (
    <div className="handletur" role="dialog" aria-label="Handletur">
      <header>
        <button type="button" className="lenke" onClick={onLukk}>Lukk</button>
        <div className="fremdrift"><b>{tatt.length} av {varer.length} i kurven</b><div className="spor"><span style={{ width: `${varer.length ? (tatt.length / varer.length) * 100 : 0}%` }} /></div></div>
        <button type="button" className="primær" onClick={onFerdig}>Ferdig</button>
      </header>
      {/* Impulskjøp: alltid synlig nede i hjørnet under handleturen. */}
      <label className={`impuls-flytende${laster ? ' laster' : ''}`} aria-label="Impulskjøp – ta bilde av vare som ikke står på listen">
        <input type="file" accept="image/*" capture="environment" disabled={laster}
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImpuls(f); }} />
        {laster ? <span className="spinn" /> : <Ikon navn="kamera" størrelse={26} />}
        <span>Impulskjøp</span>
      </label>
      <div className="tur-innhold">
        {avdelinger.map((a) => (
          <div key={a} className="avdeling">
            <h3>{avdelingNavn(a)}</h3>
            <ul className="hliste">{igjen.filter((v) => v.avdeling === a).map((v) => rad(v, true))}</ul>
          </div>
        ))}
        {!igjen.length && <p className="tomt midt-tekst">Alt er i kurven. Trykk «Ferdig» og registrer kvitteringen hjemme.</p>}
        {(tatt.length > 0 || ekstra.length > 0) && (
          <div className="avdeling i-kurven">
            <h3>I kurven ({tatt.length + ekstra.length})</h3>
            <ul className="hliste">
              {tatt.map((v) => rad(v, true))}
              {ekstra.map((k) => <EkstraRad key={k.id} k={k} stor onFjern={onFjernEkstra} />)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
