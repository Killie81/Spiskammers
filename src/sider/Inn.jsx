import { useState } from 'react';
import { rpc, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, lesStrekkode, tilBase64 } from '../bilde.js';
import { STEDER, holdbarTekst } from '../format.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';
import Kvittering from './Kvittering.jsx';

const TOM = { vare: '', merke: '', ean: '', kategori: 'annet', pakning_mengde: '', pakning_enhet: 'stk', andel: 1, holdbarhet: '', dato_type: 'best_for', lagringssted: 'kjoleskap', antall: 1 };
const ANDELER = [[1, '1/1 full'], [0.75, '¾'], [0.5, '½'], [0.25, '¼']];

export default function Inn({ husstand, vis }) {
  const [modus, setModus] = useState('vare');
  const [fase, setFase] = useState('start'); // start | leser | skjema
  const [v, setV] = useState(TOM);
  const [bilde, setBilde] = useState(null);
  const [blob, setBlob] = useState(null);
  const [fotoAndel, setFotoAndel] = useState(null);
  const [datoLest, setDatoLest] = useState(false);
  const [lagrer, setLagrer] = useState(false);

  const sett = (k, x) => setV((o) => ({ ...o, [k]: x }));
  const nullstill = () => { setFase('start'); setV(TOM); setBilde(null); setBlob(null); setFotoAndel(null); setDatoLest(false); };

  async function påBilde(fil) {
    setFase('leser'); setBilde(URL.createObjectURL(fil));
    try {
      const { blob: b, canvas } = await krympBilde(fil);
      setBlob(b);
      const ean = await lesStrekkode(canvas);
      const r = await spørClaude({ modus: 'vare', bilde: await tilBase64(b), ean });
      const dato = typeof r.holdbarhet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.holdbarhet) ? r.holdbarhet : '';
      const andel = typeof r.andel_igjen === 'number' ? Math.round(r.andel_igjen * 20) / 20 : 1;
      setFotoAndel(typeof r.andel_igjen === 'number' && r.andel_igjen < 0.95 ? andel : null);
      setDatoLest(Boolean(dato));
      setV({
        ...TOM, vare: r.vare || '', merke: r.merke || '', ean: ean || r.ean || '', kategori: r.kategori || 'annet',
        pakning_mengde: r.pakning_mengde ?? '', pakning_enhet: r.pakning_enhet || 'stk', andel: andel >= 0.95 ? 1 : andel,
        holdbarhet: dato, dato_type: r.dato_type || 'best_for', lagringssted: r.lagringssted || 'kjoleskap',
      });
      setFase('skjema');
    } catch (e) {
      vis(`Bildet kunne ikke leses: ${e.message}`);
      setFase('start');
    }
  }

  async function lagre() {
    if (!v.vare.trim()) { vis('Varen trenger et navn'); return; }
    setLagrer(true);
    try {
      const sti = await lastOppBilde(husstand.id, blob, 'inn');
      await rpc('registrer_inn', {
        p_navn: v.vare.trim(), p_merke: v.merke || null, p_ean: v.ean || null, p_kategori: v.kategori,
        p_mengde: v.pakning_mengde === '' ? null : Number(v.pakning_mengde), p_enhet: v.pakning_enhet, p_sted: v.lagringssted,
        p_antall: v.antall, p_andel: v.andel, p_holdbarhet: v.holdbarhet || null, p_dato_type: v.holdbarhet ? v.dato_type : null,
        p_pris: null, p_kvittering: null, p_metode: blob ? (v.ean ? 'strekkode' : 'foto') : 'manuelt', p_bilde: sti,
      });
      vis(`${v.antall > 1 ? `${v.antall} × ` : ''}${v.vare} lagt inn`);
      nullstill();
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
    }
    setLagrer(false);
  }

  return (
    <section className="inn">
      <div className="bryter">
        <button type="button" className={modus === 'vare' ? 'på' : ''} onClick={() => setModus('vare')}>Vare</button>
        <button type="button" className={modus === 'kvittering' ? 'på' : ''} onClick={() => setModus('kvittering')}>Kvittering</button>
      </div>

      {modus === 'kvittering' && <Kvittering husstand={husstand} vis={vis} />}

      {modus === 'vare' && fase === 'start' && (
        <div className="kolonne">
          <Fotoknapp tekst="Ta bilde av varen" onFil={påBilde} />
          <Fotoknapp tekst="Velg bilde fra albumet" onFil={påBilde} kamera={false} klasse="sekundær" ikon="" />
          <button type="button" className="sekundær" onClick={() => setFase('skjema')}>Registrer uten bilde</button>
        </div>
      )}

      {modus === 'vare' && fase === 'leser' && (
        <div className="kolonne">
          <div className="forhånd"><img src={bilde} alt="Bilde av varen" /></div>
          <p className="midt"><span className="spinn" /> Leser varen …</p>
        </div>
      )}

      {modus === 'vare' && fase === 'skjema' && (
        <div className="rad">
          {bilde && <div className="forhånd liten"><img src={bilde} alt="Bilde av varen" /></div>}
          <div className="kort skjema">
            <label>Vare<input value={v.vare} onChange={(e) => sett('vare', e.target.value)} /></label>
            <div className="to">
              <label>Pakning<input inputMode="decimal" value={v.pakning_mengde} onChange={(e) => sett('pakning_mengde', e.target.value.replace(',', '.'))} /></label>
              <label>Enhet<select value={v.pakning_enhet} onChange={(e) => sett('pakning_enhet', e.target.value)}>
                <option value="ml">ml</option><option value="g">g</option><option value="stk">stk</option></select></label>
            </div>
            <span className="etikett">Antall like pakninger</span>
            <div className="teller">
              <button type="button" aria-label="Færre" onClick={() => sett('antall', Math.max(1, v.antall - 1))}>−</button>
              <b>{v.antall}</b>
              <button type="button" aria-label="Flere" onClick={() => sett('antall', Math.min(99, v.antall + 1))}>+</button>
            </div>
            <span className="etikett">Mengde{fotoAndel != null ? ' (anslått fra bildet)' : ''}</span>
            <div className="valg">
              {ANDELER.map(([a, t]) => (
                <button key={a} type="button" className={v.andel === a ? 'på' : ''} onClick={() => sett('andel', a)}>{t}</button>
              ))}
              {fotoAndel != null && !ANDELER.some(([a]) => a === fotoAndel) && (
                <button type="button" className={v.andel === fotoAndel ? 'på' : ''} onClick={() => sett('andel', fotoAndel)}>{Math.round(fotoAndel * 100)} %</button>
              )}
            </div>
            <span className="etikett">Lagringssted</span>
            <div className="valg">
              {STEDER.map(([id, navn]) => (
                <button key={id} type="button" className={v.lagringssted === id ? 'på' : ''} onClick={() => sett('lagringssted', id)}>{navn}</button>
              ))}
            </div>
            <div className="to">
              <label>{v.dato_type === 'siste_forbruksdag' ? 'Siste forbruksdag' : 'Best før'}
                <input type="date" value={v.holdbarhet} onChange={(e) => { sett('holdbarhet', e.target.value); setDatoLest(false); }} /></label>
              <label>Datotype<select value={v.dato_type} onChange={(e) => sett('dato_type', e.target.value)}>
                <option value="best_for">Best før</option><option value="siste_forbruksdag">Siste forbruksdag</option></select></label>
            </div>
            <p className="dempet">{v.holdbarhet ? `${holdbarTekst(v.holdbarhet)}${datoLest ? ' · lest fra pakningen' : ''}` : 'Ingen dato – legg inn hvis den finnes.'}</p>
            <div className="valg">
              <button type="button" className="primær" disabled={lagrer} onClick={lagre}>{lagrer ? 'Lagrer …' : 'Legg inn'}</button>
              <button type="button" className="lenke" onClick={nullstill}>Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
