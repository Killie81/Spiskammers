import { useState } from 'react';
import { rpc } from '../supabase.js';
import { glassAndel, prosent, stedNavn, andelFraVekt } from '../format.js';
import { Restbar, Holdbar } from './Rest.jsx';
import ProsentVelger from './ProsentVelger.jsx';

// Bekreft uttak av én pakning. Ett trykk lagrer.
// foto = { andel_igjen, grunnlag_mengde, vekt_g } fra Claude, eller null ved manuelt uttak.
// Står varen på vekta og emballasjevekten er kjent, regnes resten nøyaktig ut fra vekten.
export default function UttakBekreft({ pakning, lager, foto, husstand, metode, bildeSti, vis, onFerdig, onAvbryt }) {
  const [lagrer, setLagrer] = useState(false);
  const [egen, setEgen] = useState(null); // egen prosent fra glidebryteren
  // Stykkvarer (bananer o.l.): antall stk av samme vare på samme sted.
  const stk = pakning.stykkvis
    ? (lager ? lager.filter((p) => p.produkt_id === pakning.produkt_id && p.sted === pakning.sted).length : pakning.antall || 1)
    : 0;
  const [antallUt, setAntallUt] = useState(() => Math.max(1, Math.min(stk || 1, Number(foto?.antall_stk) || 1)));
  const a = Number(pakning.andel);
  const g = glassAndel(pakning.pakning_mengde, pakning.pakning_enhet, husstand.glass_ml);

  // Søtsaker: hvem som åpner pakken skal registreres.
  const personer = husstand.personer || [];
  const måVelge = pakning.kategori === 'sotsaker' && !pakning.apnet && personer.length > 0;
  const [hvem, setHvem] = useState('');
  const låst = lagrer || (måVelge && !hvem);
  const merkÅpnet = (type) => (måVelge && hvem && type === 'forbruk' ? rpc('sett_apnet_av', { p_pakning: pakning.id, p_navn: hvem }) : null);
  const hvemBoks = måVelge && (
    <div className="søtsak-hvem">
      <span className="etikett">Hvem åpner pakken?</span>
      <div className="valg">
        {personer.map((n) => <button key={n} type="button" className={hvem === n ? 'på' : ''} onClick={() => setHvem(n)}>{n}</button>)}
      </div>
    </div>
  );

  async function lagre(nyAndel, type, beskrivelse) {
    setLagrer(true);
    try {
      const hid = await rpc('registrer_uttak', {
        p_pakning: pakning.id, p_ny_andel: nyAndel, p_type: type, p_metode: metode, p_bilde: bildeSti || null,
      });
      await merkÅpnet(type);
      if (måVelge && hvem && type === 'forbruk') beskrivelse += ` · åpnet av ${hvem}`;
      vis(`${pakning.navn}: ${beskrivelse}`, () => rpc('angre_hendelse', { p_hendelse: hid }));
      onFerdig();
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
      setLagrer(false);
    }
  }

  async function taUtStk(n, type) {
    setLagrer(true);
    try {
      const ider = await rpc('ta_ut_stk', { p_pakning: pakning.id, p_antall: n, p_type: type, p_metode: metode, p_bilde: bildeSti || null });
      await merkÅpnet(type);
      const tekst = `${type === 'svinn' ? 'kastet' : 'tok'} ${ider.length} stk · ${stk - ider.length} igjen`;
      vis(`${pakning.navn}: ${tekst}`, async () => { for (const h of ider) await rpc('angre_hendelse', { p_hendelse: h }); });
      onFerdig();
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
      setLagrer(false);
    }
  }

  if (pakning.stykkvis) {
    return (
      <div className="kort bekreft">
        <div className="hode">
          <div>
            <h2>{pakning.navn}</h2>
            <p className="dempet">{[pakning.merke, stedNavn(pakning.sted)].filter(Boolean).join(' · ')} · <Holdbar dato={pakning.holdbarhet} type={pakning.dato_type} /></p>
          </div>
          <div className="nå stk"><b>{stk}</b><span>stk igjen</span></div>
        </div>
        {hvemBoks}
        <span className="etikett">Hvor mange tar du?</span>
        <div className="teller">
          <button type="button" aria-label="Færre" disabled={antallUt <= 1} onClick={() => setAntallUt(antallUt - 1)}>−</button>
          <b>{antallUt}</b>
          <button type="button" aria-label="Flere" disabled={antallUt >= stk} onClick={() => setAntallUt(antallUt + 1)}>+</button>
        </div>
        <button type="button" className="primær stor" disabled={låst} onClick={() => taUtStk(antallUt, 'forbruk')}>
          Ta ut {antallUt} stk<small>{stk - antallUt} igjen etterpå</small>
        </button>
        <div className="valg">
          {stk > 1 && antallUt !== stk && <button type="button" disabled={låst} onClick={() => taUtStk(stk, 'forbruk')}>Alle {stk}</button>}
          <button type="button" className="kastet" disabled={lagrer} onClick={() => taUtStk(antallUt, 'svinn')}>Kastet {antallUt}</button>
        </div>
        {onAvbryt && <button type="button" className="lenke" onClick={onAvbryt}>Avbryt</button>}
      </div>
    );
  }

  const vekt = foto && foto.vekt_g > 0 ? Number(foto.vekt_g) : null;
  // Ukjent emballasje: bruk anslaget fra bildet til den er lært.
  const fotoTara = !(pakning.tara_g > 0) && Number(foto?.emballasje?.anslag_g) > 0 ? Number(foto.emballasje.anslag_g) : null;
  const tara = pakning.tara_g > 0 ? pakning.tara_g : fotoTara;
  const vektAndel = vekt ? andelFraVekt(vekt, tara, pakning.netto_g) : null;
  const bildeAndel = foto && typeof foto.andel_igjen === 'number' ? Math.max(0, foto.andel_igjen) : null;
  const forslag = vektAndel ?? bildeAndel;
  const forslagIgjen = forslag != null ? Math.min(a, forslag) : null;
  const grunnlag = vektAndel != null
    ? `Veid ${Math.round(vekt)} g − emballasje ${Math.round(tara)} g${fotoTara ? ' (anslått fra bildet)' : ''} av ${Math.round(pakning.netto_g)} g`
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
      {hvemBoks}

      {forslagIgjen != null && (
        <button type="button" className={`primær stor${vektAndel != null ? ' veid' : ''}`} disabled={låst}
          onClick={() => lagre(forslagIgjen, 'forbruk', forslagIgjen === 0 ? 'tom' : `${prosent(forslagIgjen)} igjen`)}>
          Lagre: {forslagIgjen === 0 ? 'tom' : `${prosent(forslagIgjen)} igjen`}
          {grunnlag && <small>{grunnlag}</small>}
        </button>
      )}

      <p className="dempet">{forslagIgjen != null ? 'Eller velg selv:' : 'Hvor mye ble tatt ut?'}</p>
      <div className="valg">
        {valg.map((v) => (
          <button key={v.navn} type="button" disabled={låst || v.ny >= a} onClick={() => lagre(v.ny, 'forbruk', v.navn)}>{v.navn.replace('tok ', '−')}</button>
        ))}
        <button type="button" disabled={låst || !g} title={g ? '' : 'Bare for varer målt i ml'}
          onClick={() => lagre(Math.max(0, a - g), 'forbruk', `1 glass (${husstand.glass_ml} ml)`)}>1 glass</button>
        <button type="button" disabled={låst} onClick={() => lagre(0, 'forbruk', 'tom')}>Tom</button>
        <button type="button" className="kastet" disabled={lagrer} onClick={() => lagre(0, 'svinn', 'kastet')}>Kastet</button>
      </div>

      <details className="egen-prosent" onToggle={(e) => e.currentTarget.open && egen == null && setEgen(forslagIgjen ?? a)}>
        <summary>Angi nøyaktig hvor mye som er igjen</summary>
        {egen != null && (
          <>
            <ProsentVelger verdi={egen} onEndre={(v) => setEgen(Math.min(a, v))} valg={[75, 50, 25, 10]} etikett="Igjen etter uttak" />
            <button type="button" className="primær" disabled={låst || egen >= a}
              onClick={() => lagre(egen, 'forbruk', egen === 0 ? 'tom' : `${prosent(egen)} igjen`)}>Lagre {prosent(egen)} igjen</button>
          </>
        )}
      </details>
      {onAvbryt && <button type="button" className="lenke" onClick={onAvbryt}>Avbryt</button>}
    </div>
  );
}
