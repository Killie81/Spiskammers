import { useState } from 'react';
import { rpc } from '../supabase.js';
import { glassAndel, prosent, stedNavn } from '../format.js';
import { Restbar, Holdbar } from './Rest.jsx';

// Bekreft uttak av én pakning. Ett trykk lagrer.
// foto = { andel_igjen, grunnlag_mengde } fra Claude, eller null ved manuelt uttak.
export default function UttakBekreft({ pakning, foto, husstand, metode, bildeSti, vis, onFerdig, onAvbryt }) {
  const [lagrer, setLagrer] = useState(false);
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

  const fotoAndel = foto && typeof foto.andel_igjen === 'number' ? Math.min(a, Math.max(0, foto.andel_igjen)) : null;
  const tok = (x, navn) => ({ ny: Math.max(0, a - x), navn });
  const valg = [tok(0.25, 'tok ¼'), tok(0.5, 'tok ½'), tok(0.75, 'tok ¾')];

  return (
    <div className="kort bekreft">
      <div className="hode">
        <div>
          <h2>{pakning.navn}</h2>
          <p className="dempet">{[pakning.merke, stedNavn(pakning.sted)].filter(Boolean).join(' · ')} · <Holdbar dato={pakning.holdbarhet} type={pakning.dato_type} /></p>
        </div>
        <div className="nå"><Restbar andel={a} /><span>{prosent(a)} igjen nå</span></div>
      </div>

      {fotoAndel != null && (
        <button type="button" className="primær stor" disabled={lagrer}
          onClick={() => lagre(fotoAndel, 'forbruk', fotoAndel === 0 ? 'tom' : `${prosent(fotoAndel)} igjen`)}>
          Lagre: {fotoAndel === 0 ? 'tom' : `${prosent(fotoAndel)} igjen`}
          {foto.grunnlag_mengde && <small>{foto.grunnlag_mengde}</small>}
        </button>
      )}

      <p className="dempet">{fotoAndel != null ? 'Eller velg selv:' : 'Hvor mye ble tatt ut?'}</p>
      <div className="valg">
        {valg.map((v) => (
          <button key={v.navn} type="button" disabled={lagrer || v.ny >= a} onClick={() => lagre(v.ny, 'forbruk', v.navn)}>{v.navn.replace('tok ', '')}</button>
        ))}
        <button type="button" disabled={lagrer || !g} title={g ? '' : 'Bare for varer målt i ml'}
          onClick={() => lagre(Math.max(0, a - g), 'forbruk', `1 glass (${husstand.glass_ml} ml)`)}>1 glass</button>
        <button type="button" disabled={lagrer} onClick={() => lagre(0, 'forbruk', 'tom')}>Tom</button>
        <button type="button" className="kastet" disabled={lagrer} onClick={() => lagre(0, 'svinn', 'kastet')}>Kastet</button>
      </div>
      {onAvbryt && <button type="button" className="lenke" onClick={onAvbryt}>Avbryt</button>}
    </div>
  );
}
