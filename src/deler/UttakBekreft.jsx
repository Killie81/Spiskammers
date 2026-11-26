import { useState } from 'react';
import { rpc } from '../supabase.js';
import { glassAndel, prosent, stedNavn, andelFraVekt } from '../format.js';
import { Restbar, Holdbar } from './Rest.jsx';
import ProsentVelger from './ProsentVelger.jsx';

// Bekreft uttak av én pakning. Ett trykk lagrer.
// foto = { andel_igjen, grunnlag_mengde, vekt_g } fra Claude, eller null ved manuelt uttak.
// Står varen på vekta og emballasjevekten er kjent, regnes resten nøyaktig ut fra vekten.
export default function UttakBekreft({ pakning, foto, husstand, metode, bildeSti, vis, onFerdig, onAvbryt }) {
  const [lagrer, setLagrer] = useState(false);
  const [egen, setEgen] = useState(null); // egen prosent fra glidebryteren
  const a = Number(pakning.andel);
  const g = glassAndel(pakning.pakning_mengde, pakning.pakning_enhet, husstand.glass_ml);

  async function lagre(nyAndel, type, beskrivelse) {
    setLagrer(true);
    try {
      const hid = await rpc('registrer_uttak', {
        p_pakning: pakning.id, p_ny_andel: nyAndel, p_type: type, p_metode: metode, p_bilde: bildeSti || null,
      });
      vis(`${pakning.navn}: ${beskrivelse}`, () => rpc('angre_hendelse', { p_hendelse: hid }));
      onFerdig();
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
      setLagrer(false);
    }
  }

  const vekt = foto && foto.vekt_g > 0 ? Number(foto.vekt_g) : null;
  const vektAndel = vekt ? andelFraVekt(vekt, pakning.tara_g, pakning.netto_g) : null;
  const bildeAndel = foto && typeof foto.andel_igjen === 'number' ? Math.max(0, foto.andel_igjen) : null;
  const forslag = vektAndel ?? bildeAndel;
  const forslagIgjen = forslag != null ? Math.min(a, forslag) : null;
  const grunnlag = vektAndel != null
    ? `Veid ${Math.round(vekt)} g − emballasje ${Math.round(pakning.tara_g)} g av ${Math.round(pakning.netto_g)} g`
    : vekt ? `Veid ${Math.round(vekt)} g, men emballasjevekten er ikke kjent ennå – anslått fra bildet` : foto?.grunnlag_mengde;
  const tok = (x) => ({ ny: Math.max(0, a - x), navn: `tok ${Math.round(x * 100)} %` });
  const valg = [tok(0.25), tok(0.5), tok(0.75)];

  return (
    <div className="kort bekreft">
      <div className="hode">
        <div>
          <h2>{pakning.navn}</h2>
          <p className="dempet">{[pakning.merke, stedNavn(pakning.sted)].filter(Boolean).join(' · ')} · <Holdbar dato={pakning.holdbarhet} type={pakning.dato_type} /></p>
        </div>
        <div className="nå"><Restbar andel={a} /><span>{prosent(a)} igjen nå</span></div>
      </div>

      {forslagIgjen != null && (
        <button type="button" className={`primær stor${vektAndel != null ? ' veid' : ''}`} disabled={lagrer}
          onClick={() => lagre(forslagIgjen, 'forbruk', forslagIgjen === 0 ? 'tom' : `${prosent(forslagIgjen)} igjen`)}>
          Lagre: {forslagIgjen === 0 ? 'tom' : `${prosent(forslagIgjen)} igjen`}
          {grunnlag && <small>{grunnlag}</small>}
        </button>
      )}

      <p className="dempet">{forslagIgjen != null ? 'Eller velg selv:' : 'Hvor mye ble tatt ut?'}</p>
      <div className="valg">
        {valg.map((v) => (
          <button key={v.navn} type="button" disabled={lagrer || v.ny >= a} onClick={() => lagre(v.ny, 'forbruk', v.navn)}>{v.navn.replace('tok ', '−')}</button>
        ))}
        <button type="button" disabled={lagrer || !g} title={g ? '' : 'Bare for varer målt i ml'}
          onClick={() => lagre(Math.max(0, a - g), 'forbruk', `1 glass (${husstand.glass_ml} ml)`)}>1 glass</button>
        <button type="button" disabled={lagrer} onClick={() => lagre(0, 'forbruk', 'tom')}>Tom</button>
        <button type="button" className="kastet" disabled={lagrer} onClick={() => lagre(0, 'svinn', 'kastet')}>Kastet</button>
      </div>

      <details className="egen-prosent" onToggle={(e) => e.currentTarget.open && egen == null && setEgen(forslagIgjen ?? a)}>
        <summary>Angi nøyaktig hvor mye som er igjen</summary>
        {egen != null && (
          <>
            <ProsentVelger verdi={egen} onEndre={(v) => setEgen(Math.min(a, v))} valg={[75, 50, 25, 10]} etikett="Igjen etter uttak" />
            <button type="button" className="primær" disabled={lagrer || egen >= a}
              onClick={() => lagre(egen, 'forbruk', egen === 0 ? 'tom' : `${prosent(egen)} igjen`)}>Lagre {prosent(egen)} igjen</button>
          </>
        )}
      </details>
      {onAvbryt && <button type="button" className="lenke" onClick={onAvbryt}>Avbryt</button>}
    </div>
  );
}
