import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { kr, leggTilDager } from '../format.js';
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
    </section>
  );
}
