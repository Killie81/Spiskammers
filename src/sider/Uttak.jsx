import { useEffect, useState } from 'react';
import { hentLager, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, lesStrekkode, tilBase64 } from '../bilde.js';
import { stedNavn, prosent, dagerIgjen } from '../format.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';
import UttakBekreft from '../deler/UttakBekreft.jsx';
import { Holdbar, Restbar } from '../deler/Rest.jsx';
import Ikon, { StedMerke } from '../deler/Ikon.jsx';

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

  const snart = lager.filter((p) => { const d = dagerIgjen(p.holdbarhet); return d != null && d <= 2; }).length;
  const åpnet = lager.filter((p) => p.apnet).length;
  const time = new Date().getHours();
  const hilsen = time < 10 ? 'God morgen' : time < 17 ? 'God dag' : 'God kveld';
  const dato = new Date().toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="uttak">
      <div className="velkommen">
        <div>
          <p className="dato">{dato}</p>
          <h1>{hilsen}</h1>
        </div>
        <div className="nøkkeltall">
          <div><b>{lager.length}</b><span>pakninger</span></div>
          <div className={snart ? 'varsel-tall' : ''}><b>{snart}</b><span>går ut snart</span></div>
          <div><b>{åpnet}</b><span>åpnet</span></div>
        </div>
      </div>
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
      <Fotoknapp tekst="Ta bilde av varen du tar ut" undertekst="Varen og mengden kjennes igjen automatisk" onFil={påBilde} />
      <div className="seksjon-hode">
        <h2>{treffSøk.length ? 'Søketreff' : 'Bruk først'}</h2>
        <label className="søkefelt"><Ikon navn="søk" størrelse={18} /><input type="search" placeholder="Søk i lageret" value={søk} onChange={(e) => setSøk(e.target.value)} /></label>
      </div>
      <div className="fliser">
        {(treffSøk.length ? treffSøk : forslag).map((p) => (
          <button key={p.id} type="button" className="flis" onClick={() => velg(p)}>
            <span className="flis-topp"><StedMerke sted={p.sted} /><Holdbar dato={p.holdbarhet} type={p.dato_type} /></span>
            <b>{p.navn}</b>
            <span className="flis-bunn"><Restbar andel={Number(p.andel)} /><span className="dempet">{prosent(p.andel)}</span></span>
          </button>
        ))}
        {!lager.length && <p className="tomt">Lageret er tomt. Start med «Legg inn».</p>}
      </div>
    </section>
  );
}
