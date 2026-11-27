import { useEffect, useState } from 'react';
import { hentLager, rpc } from '../supabase.js';
import { stedNavn, prosent, dagerIgjen, grupper } from '../format.js';
import { Restbar, Holdbar } from '../deler/Rest.jsx';
import UttakBekreft from '../deler/UttakBekreft.jsx';
import Ikon, { StedMerke } from '../deler/Ikon.jsx';
import StedVelger, { tellPerSted } from '../deler/StedVelger.jsx';

export default function Lager({ husstand, vis, startSted = 'alle' }) {
  const [lager, setLager] = useState(null);
  const [sted, setSted] = useState(startSted);
  const [søk, setSøk] = useState('');
  const [åpen, setÅpen] = useState(null);
  const [handling, setHandling] = useState(null); // uttak | flytt

  const last = () => hentLager().then(setLager).catch((e) => vis(e.message));
  useEffect(() => { last(); }, []);

  if (!lager) return <p className="midt"><span className="spinn" /></p>;

  const snart = lager.filter((p) => { const d = dagerIgjen(p.holdbarhet); return d != null && d <= 2; });
  const vist = grupper(lager)
    .filter((p) => sted === 'alle' || p.sted === sted)
    .filter((p) => !søk.trim() || `${p.navn} ${p.merke || ''}`.toLowerCase().includes(søk.trim().toLowerCase()));

  const lukk = () => { setÅpen(null); setHandling(null); last(); };

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
              <p className="dempet">{stedNavn(åpen.sted)} · {åpen.stykkvis ? `${åpen.antall} stk` : `${prosent(åpen.andel)}`} igjen · <Holdbar dato={åpen.holdbarhet} type={åpen.dato_type} /></p>
              {handling === 'flytt' ? (
                <>
                  <p className="dempet">Flytt til:</p>
                  <StedVelger valgt={åpen.sted} onVelg={(id) => (id !== åpen.sted ? flytt(id) : setHandling(null))} />
                  <button type="button" className="lenke" onClick={() => setHandling(null)}>Tilbake</button>
                </>
              ) : (
                <div className="valg">
                  <button type="button" className="primær" onClick={() => setHandling('uttak')}>{åpen.antall > 1 && !åpen.stykkvis ? 'Ta ut én' : 'Ta ut'}</button>
                  <button type="button" onClick={() => setHandling('flytt')}>{åpen.antall > 1 ? `Flytt alle ${åpen.antall}` : 'Flytt'}</button>
                  <button type="button" className="lenke" onClick={lukk}>Lukk</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ul className="liste">
        {vist.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => { setÅpen(p); setHandling(null); }}>
              <StedMerke sted={p.sted} />
              <span className="navn"><b>{p.navn}{p.antall > 1 && !p.stykkvis && <span className="antall"> · {p.antall} stk</span>}</b><small className="dempet">{[p.merke, stedNavn(p.sted)].filter(Boolean).join(' · ')}</small></span>
              <span className="rest">{p.stykkvis ? <small className="dempet">{p.antall} stk</small> : <><Restbar andel={Number(p.andel)} /><small className="dempet">{prosent(p.andel)}</small></>}</span>
              <Holdbar dato={p.holdbarhet} type={p.dato_type} />
            </button>
          </li>
        ))}
        {!vist.length && <li className="dempet tom">Ingenting her.</li>}
      </ul>
    </section>
  );
}
