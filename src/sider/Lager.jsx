import { useEffect, useState } from 'react';
import { supabase, hentLager, rpc } from '../supabase.js';
import { stedNavn, prosent, dagerIgjen, grupper, sorterLager, TYPER, typeNavn } from '../format.js';
import { Restbar, Holdbar } from '../deler/Rest.jsx';
import UttakBekreft from '../deler/UttakBekreft.jsx';
import Ikon, { StedMerke } from '../deler/Ikon.jsx';
import StedVelger, { tellPerSted } from '../deler/StedVelger.jsx';

export default function Lager({ husstand, vis, startSted = 'alle' }) {
  const [lager, setLager] = useState(null);
  const [sted, setSted] = useState(startSted);
  const [søk, setSøk] = useState('');
  const [åpen, setÅpen] = useState(null);
  const [handling, setHandling] = useState(null); // uttak | flytt | fjern

  const last = () => hentLager().then(setLager).catch((e) => vis(e.message));
  useEffect(() => { last(); }, []);

  if (!lager) return <p className="midt"><span className="spinn" /></p>;

  const snart = lager.filter((p) => { const d = dagerIgjen(p.holdbarhet); return d != null && d <= 2; });
  const vist = sorterLager(grupper(lager))
    .filter((p) => sted === 'alle' || p.sted === sted)
    .filter((p) => !søk.trim() || `${p.navn} ${p.merke || ''}`.toLowerCase().includes(søk.trim().toLowerCase()));

  const lukk = () => { setÅpen(null); setHandling(null); last(); };

  // Prøvetid/feilregistrering: fjernes uten å telle som forbruk eller svinn.
  async function fjern(pakninger) {
    try {
      const ider = await rpc('fjern_pakninger', { p_ider: pakninger.map((p) => p.id) });
      vis(`${pakninger.length > 1 ? `${pakninger.length} × ` : ''}${åpen.navn} fjernet – teller ikke i statistikken`,
        async () => { for (const h of ider) await rpc('angre_hendelse', { p_hendelse: h }); last(); });
      lukk();
    } catch (e) { vis(`Kunne ikke fjerne: ${e.message}`); }
  }

  async function endreType(type) {
    const { error } = await supabase.from('produkt').update({ kategori: type }).eq('id', åpen.produkt_id);
    if (error) return vis(`Kunne ikke endre type: ${error.message}`);
    setÅpen({ ...åpen, kategori: type });
    hentLager().then(setLager);
  }

  async function flytt(til) {
    try {
      // En sammenslått linje flyttes samlet.
      for (const p of åpen.pakninger || [åpen]) await rpc('flytt_pakning', { p_pakning: p.id, p_sted: til });
      vis(`${åpen.antall > 1 ? `${åpen.antall} × ` : ''}${åpen.navn} flyttet til ${stedNavn(til)}`);
      lukk();
    } catch (e) { vis(`Kunne ikke flytte: ${e.message}`); }
  }

  return (
    <section className="lager">
      {snart.length > 0 && (
        <div className="banner">
          <Ikon navn="klokke" størrelse={22} />
          <span><b>{snart.length} {snart.length === 1 ? 'vare går' : 'varer går'} ut innen to dager:</b> {snart.map((p) => p.navn).join(', ')}</span>
        </div>
      )}
      <StedVelger valgt={sted} onVelg={setSted} tall={tellPerSted(lager)} medAlle klasse="klebrig" />
      <label className="søkefelt bred"><Ikon navn="søk" størrelse={18} /><input type="search" placeholder="Søk i lageret" value={søk} onChange={(e) => setSøk(e.target.value)} /></label>

      {åpen && (
        <div className="ark" role="dialog" aria-label={åpen.navn}>
          {handling === 'uttak' ? (
            <UttakBekreft pakning={åpen} lager={lager} foto={null} husstand={husstand} metode="manuelt" vis={vis} onFerdig={lukk} onAvbryt={() => setHandling(null)} />
          ) : (
            <div className="kort">
              <h2>{åpen.navn}{åpen.antall > 1 && <span className="antall"> · {åpen.antall} stk</span>}</h2>
              <p className="dempet">{stedNavn(åpen.sted)} · {åpen.stykkvis ? `${åpen.antall} stk` : `${prosent(åpen.andel)}`} igjen · <Holdbar dato={åpen.holdbarhet} type={åpen.dato_type} />{åpen.apnet_av && <> · åpnet av {åpen.apnet_av}</>}</p>
              {handling === 'fjern' ? (
                <div className="fjern">
                  <p>Fjernes fra lageret uten å telle som forbruk eller svinn. Bruk dette for feilregistreringer og prøving.</p>
                  <div className="valg">
                    <button type="button" className="kastet" onClick={() => fjern([åpen])}>{åpen.antall > 1 ? 'Fjern 1' : 'Fjern'}</button>
                    {åpen.antall > 1 && <button type="button" className="kastet" onClick={() => fjern(åpen.pakninger)}>Fjern alle {åpen.antall}</button>}
                    <button type="button" className="lenke" onClick={() => setHandling(null)}>Tilbake</button>
                  </div>
                </div>
              ) : handling === 'flytt' ? (
                <>
                  <p className="dempet">Flytt til:</p>
                  <StedVelger valgt={åpen.sted} onVelg={(id) => (id !== åpen.sted ? flytt(id) : setHandling(null))} />
                  <button type="button" className="lenke" onClick={() => setHandling(null)}>Tilbake</button>
                </>
              ) : (
                <div className="valg">
                  <button type="button" className="primær" onClick={() => setHandling('uttak')}>{åpen.antall > 1 && !åpen.stykkvis ? 'Ta ut én' : 'Ta ut'}</button>
                  <button type="button" onClick={() => setHandling('flytt')}>{åpen.antall > 1 ? `Flytt alle ${åpen.antall}` : 'Flytt'}</button>
                  <button type="button" onClick={() => setHandling('fjern')}>Fjern</button>
                  <button type="button" className="lenke" onClick={lukk}>Lukk</button>
                </div>
              )}
              {!handling && (
                <label className="type-valg">Type
                  <select value={åpen.kategori || 'annet'} onChange={(e) => endreType(e.target.value)}>
                    {TYPER.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="liste">
        {vist.map((p, i) => {
          const forrige = vist[i - 1];
          const nyttSted = sted === 'alle' && (!forrige || forrige.sted !== p.sted);
          const nyType = !forrige || nyttSted || forrige.sted !== p.sted || (forrige.kategori || 'annet') !== (p.kategori || 'annet');
          return [
            nyttSted && <li key={`s-${p.sted}`} className="seksjon-sted"><StedMerke sted={p.sted} /> {stedNavn(p.sted)}</li>,
            nyType && <li key={`t-${p.sted}-${p.kategori}`} className="seksjon-type">{typeNavn(p.kategori || 'annet')}</li>,
          <li key={p.id}>
            <button type="button" onClick={() => { setÅpen(p); setHandling(null); }}>
              <StedMerke sted={p.sted} />
              <span className="navn"><b>{p.navn}{p.antall > 1 && !p.stykkvis && <span className="antall"> · {p.antall} stk</span>}</b><small className="dempet">{[p.merke, p.apnet_av && `åpnet av ${p.apnet_av}`].filter(Boolean).join(' · ')}</small></span>
              <span className="rest">{p.stykkvis ? <small className="dempet">{p.antall} stk</small> : <><Restbar andel={Number(p.andel)} /><small className="dempet">{prosent(p.andel)}</small></>}</span>
              <Holdbar dato={p.holdbarhet} type={p.dato_type} />
            </button>
          </li>,
          ];
        })}
        {!vist.length && <li className="dempet tom">Ingenting her.</li>}
      </ul>
    </section>
  );
}
