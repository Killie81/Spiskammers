import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { kr, leggTilDager, ukeStart } from '../format.js';
import Ikon from '../deler/Ikon.jsx';

export default function Mer({ husstand, setHusstand, vis }) {
  const [glass, setGlass] = useState(husstand.glass_ml);
  const [tall, setTall] = useState(null);

  useEffect(() => {
    (async () => {
      const fra = leggTilDager(null, -365);
      const fra30 = new Date(Date.now() - 30 * 864e5).toISOString();
      const [{ data: utg }, { data: svinn }] = await Promise.all([
        supabase.from('utgift').select('type, belop').gte('dato', fra),
        supabase.from('hendelse').select('id').eq('type', 'svinn').gte('tid', fra30),
      ]);
      const s = (t) => (utg || []).filter((u) => u.type === t).reduce((a, u) => a + Number(u.belop), 0);
      setTall({ poser: s('pose'), pant: s('pant'), svinn: (svinn || []).length });
    })().catch(() => setTall({ poser: 0, pant: 0, svinn: 0 }));
  }, []);

  // Unormale uker (ferie, høytid) holdes utenfor når handlelisten beregner forbruket.
  const uker = [0, 1, 2, 3].map((n) => ukeStart(new Date(Date.now() - n * 7 * 864e5)));
  const [unormale, setUnormale] = useState([]);
  useEffect(() => {
    supabase.from('unormal_uke').select('uke').gte('uke', uker.at(-1)).then(({ data }) => setUnormale((data || []).map((r) => r.uke)));
  }, []);
  async function veksleUke(uke) {
    const på = unormale.includes(uke);
    setUnormale((u) => (på ? u.filter((x) => x !== uke) : [...u, uke]));
    const { error } = på
      ? await supabase.from('unormal_uke').delete().eq('uke', uke).eq('husstand_id', husstand.id)
      : await supabase.from('unormal_uke').insert({ husstand_id: husstand.id, uke });
    if (error) vis(error.message);
  }
  const ukeNavn = (u, i) => i === 0 ? 'Denne uka' : i === 1 ? 'Forrige uke' : `Uke fra ${new Date(u).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}`;

  async function lagreGlass() {
    const ml = parseInt(glass, 10);
    if (!(ml > 0)) { vis('Glasset må være over 0 ml'); return; }
    const { data, error } = await supabase.from('husstand').update({ glass_ml: ml }).eq('id', husstand.id).select().single();
    if (error) { vis(error.message); return; }
    setHusstand(data); vis(`Ett glass er nå ${ml} ml`);
  }

  return (
    <section className="mer">
      <div className="tall">
        <div className="tallkort"><Ikon navn="pose" /><b>{tall ? `${kr(tall.poser)} kr` : '…'}</b><span className="dempet">brukt på bæreposer siste år</span></div>
        <div className="tallkort"><Ikon navn="angre" /><b>{tall ? `${kr(tall.pant)} kr` : '…'}</b><span className="dempet">betalt i pant siste år</span></div>
        <div className="tallkort"><Ikon navn="søppel" /><b>{tall ? tall.svinn : '…'}</b><span className="dempet">pakninger kastet siste 30 dager</span></div>
      </div>
      <div className="kort skjema">
        <h2>Innstillinger</h2>
        <label>Ett glass (ml)
          <div className="glassrad"><input inputMode="numeric" value={glass} onChange={(e) => setGlass(e.target.value)} />
            <button type="button" className="primær" onClick={lagreGlass}>Lagre</button></div>
        </label>
        <button type="button" className="lenke" onClick={() => supabase.auth.signOut()}>Logg ut</button>
      </div>
      <div className="kort skjema">
        <h2>Unormale uker</h2>
        <p className="dempet">Handlelisten oppdateres hver torsdag kl. 14. Uker med ferie, reise eller høytid holdes utenfor når forbruket beregnes. Appen finner de fleste selv, men her kan dere markere dem.</p>
        <div className="ukeliste">
          {uker.map((u, i) => (
            <button key={u} type="button" className={unormale.includes(u) ? 'på' : ''} aria-pressed={unormale.includes(u)} onClick={() => veksleUke(u)}>
              <span>{ukeNavn(u, i)}</span><span className="bryterpille" aria-hidden="true" /><small>{unormale.includes(u) ? 'Unormal' : 'Vanlig'}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
