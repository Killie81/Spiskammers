import { useEffect, useState } from 'react';
import { hentLager, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, lesStrekkode, tilBase64 } from '../bilde.js';
import { stedNavn, prosent, dagerIgjen } from '../format.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';
import UttakBekreft from '../deler/UttakBekreft.jsx';
import { Holdbar } from '../deler/Rest.jsx';

// Startskjermen på kjøkkenet: ta bilde av varen som tas ut.
export default function Uttak({ husstand, vis, gåTil }) {
  const [lager, setLager] = useState([]);
  const [fase, setFase] = useState('start'); // start | leser | bekreft | ukjent
  const [valgt, setValgt] = useState(null);
  const [foto, setFoto] = useState(null);
  const [alternativer, setAlternativer] = useState([]);
  const [bilde, setBilde] = useState(null);
  const [bildeSti, setBildeSti] = useState(null);
  const [metode, setMetode] = useState('manuelt');
  const [søk, setSøk] = useState('');

  const last = () => hentLager().then(setLager).catch((e) => vis(e.message));
  useEffect(() => { last(); }, []);

  function nullstill() {
    setFase('start'); setValgt(null); setFoto(null); setAlternativer([]); setBilde(null); setBildeSti(null); setSøk('');
    last();
  }

  async function påBilde(fil) {
    setFase('leser'); setBilde(URL.createObjectURL(fil)); setMetode('foto');
    try {
      const { blob, canvas } = await krympBilde(fil);
      const [ean, aktuelt] = await Promise.all([lesStrekkode(canvas), hentLager()]);
      setLager(aktuelt);
      if (ean) setMetode('strekkode');
      const kandidater = aktuelt.map((p) => ({ id: p.id, navn: p.navn, merke: p.merke, ean: p.ean, sted: p.sted, andel: Number(p.andel), holdbarhet: p.holdbarhet }));
      const [svar, sti] = await Promise.all([
        spørClaude({ modus: 'uttak', bilde: await tilBase64(blob), ean, kandidater }),
        lastOppBilde(husstand.id, blob, 'uttak'),
      ]);
      setBildeSti(sti);
      const treff = aktuelt.find((p) => p.id === svar.pakning_id);
      setAlternativer((svar.alternative_ider || []).map((id) => aktuelt.find((p) => p.id === id)).filter(Boolean));
      setFoto(svar);
      if (treff) { setValgt(treff); setFase('bekreft'); } else { setFase('ukjent'); }
    } catch (e) {
      vis(`Bildet kunne ikke leses: ${e.message}`);
      setFase('start');
    }
  }

  // «Nylig og sannsynlig»: åpnede pakninger og det som går ut først.
  const forslag = [...lager]
    .sort((a, b) => (a.apnet ? 0 : 1) - (b.apnet ? 0 : 1) || (dagerIgjen(a.holdbarhet) ?? 999) - (dagerIgjen(b.holdbarhet) ?? 999))
    .slice(0, 8);
  const treffSøk = søk.trim().length > 1
    ? lager.filter((p) => `${p.navn} ${p.merke || ''}`.toLowerCase().includes(søk.trim().toLowerCase())).slice(0, 12)
    : [];

  const velg = (p, m = 'manuelt') => { setValgt(p); setMetode(m); setFase('bekreft'); };

  if (fase === 'leser') {
    return (
      <section className="uttak">
        <div className="forhånd"><img src={bilde} alt="Bilde av varen" /></div>
        <p className="midt"><span className="spinn" /> Kjenner igjen varen …</p>
      </section>
    );
  }

  if (fase === 'bekreft' && valgt) {
    return (
      <section className="uttak rad">
        {bilde && <div className="forhånd liten"><img src={bilde} alt="Bilde av varen" /></div>}
        <div className="kolonne">
          <UttakBekreft pakning={valgt} foto={foto} husstand={husstand} metode={metode} bildeSti={bildeSti}
            vis={vis} onFerdig={nullstill} onAvbryt={nullstill} />
          {alternativer.length > 0 && (
            <div className="alternativer">
              <span className="dempet">Feil vare? Kan være:</span>
              {alternativer.filter((p) => p.id !== valgt.id).map((p) => (
                <button key={p.id} type="button" onClick={() => setValgt(p)}>{p.navn} · {stedNavn(p.sted)}</button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="uttak">
      {fase === 'ukjent' && (
        <div className="kort advarsel">
          <h2>Fant ikke «{foto?.vare || 'varen'}» på lager</h2>
          <p>Velg riktig pakning under, eller registrer varen først.</p>
          <div className="valg">
            <button type="button" onClick={() => gåTil('inn')}>Legg inn varen</button>
            <button type="button" className="lenke" onClick={nullstill}>Avbryt</button>
          </div>
        </div>
      )}
      <Fotoknapp tekst="Ta bilde av varen" onFil={påBilde} />
      <input className="søk" type="search" placeholder="Søk i lageret …" value={søk} onChange={(e) => setSøk(e.target.value)} />
      <div className="fliser">
        {(treffSøk.length ? treffSøk : forslag).map((p) => (
          <button key={p.id} type="button" className="flis" onClick={() => velg(p)}>
            <b>{p.navn}</b>
            <span className="dempet">{stedNavn(p.sted)} · {prosent(p.andel)}</span>
            <Holdbar dato={p.holdbarhet} type={p.dato_type} />
          </button>
        ))}
        {!lager.length && <p className="dempet">Lageret er tomt. Start med «Legg inn».</p>}
      </div>
    </section>
  );
}
