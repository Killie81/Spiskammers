import { useState } from 'react';
import { supabase, rpc, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, tilBase64 } from '../bilde.js';
import { STEDER, kr, leggTilDager, idag, gjettStykkvis } from '../format.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';

export default function Kvittering({ husstand, vis, gåTil }) {
  const [fase, setFase] = useState('start'); // start | leser | liste
  const [k, setK] = useState(null);
  const [linjer, setLinjer] = useState([]);
  const [blob, setBlob] = useState(null);
  const [lagrer, setLagrer] = useState(false);

  const nullstill = () => { setFase('start'); setK(null); setLinjer([]); setBlob(null); };
  const endre = (i, felt, verdi) => setLinjer((ls) => ls.map((l, j) => (j === i ? { ...l, [felt]: verdi } : l)));

  async function påFil(fil) {
    setFase('leser');
    try {
      let bilde, mediaType = 'image/jpeg', b = null;
      if (fil.type === 'application/pdf') {
        bilde = await tilBase64(fil); mediaType = 'application/pdf';
      } else {
        ({ blob: b } = await krympBilde(fil, 2400));
        bilde = await tilBase64(b);
      }
      setBlob(b);
      const r = await spørClaude({ modus: 'kvittering', bilde, mediaType });
      setK(r);
      setLinjer((r.linjer || []).map((l) => ({ ...l, antall: Math.max(1, parseInt(l.antall, 10) || 1), med: l.type === 'mat' })));
      setFase('liste');
    } catch (e) {
      vis(`Kvitteringen kunne ikke leses: ${e.message}`);
      setFase('start');
    }
  }

  const sumLinjer = linjer.reduce((a, l) => a + (typeof l.pris === 'number' ? l.pris : 0), 0);
  const sumOk = typeof k?.total === 'number' ? Math.abs(sumLinjer - k.total) < 1 : null;
  const mat = linjer.map((l, i) => [l, i]).filter(([l]) => l.type === 'mat');
  const ekstra = linjer.filter((l) => l.type === 'pose' || l.type === 'pant');
  const ikkeMat = linjer.map((l, i) => [l, i]).filter(([l]) => l.type === 'ikke_mat');
  const sum = (t) => ekstra.filter((l) => l.type === t).reduce((a, l) => a + (l.pris || 0), 0);

  async function lagre() {
    setLagrer(true);
    try {
      const dato = /^\d{4}-\d{2}-\d{2}$/.test(k.dato || '') ? k.dato : idag();
      const sti = await lastOppBilde(husstand.id, blob, 'kvittering');
      const { data: kv, error } = await supabase.from('kvittering')
        .insert({ husstand_id: husstand.id, butikk: k.butikk, dato, total: k.total, bilde_sti: sti, tolkning: k })
        .select('id').single();
      if (error) throw new Error(error.message);
      let n = 0;
      for (const l of linjer.filter((x) => x.med && (x.type === 'mat' || x.type === 'ikke_mat'))) {
        const stykk = l.stykkvis ?? gjettStykkvis(l.vare);
        const ider = await rpc('registrer_inn', {
          p_navn: l.vare || l.tekst, p_merke: null, p_ean: null, p_kategori: l.kategori || 'annet',
          p_mengde: stykk ? 1 : l.pakning_mengde ?? null, p_enhet: stykk ? 'stk' : l.pakning_enhet || 'stk', p_sted: l.lagringssted || 'skap',
          p_antall: l.antall, p_andel: 1,
          p_holdbarhet: l.holdbarhet_dager ? leggTilDager(dato, l.holdbarhet_dager) : null,
          p_dato_type: l.holdbarhet_dager ? 'anslag' : null,
          p_pris: typeof l.pris === 'number' ? l.pris : null, p_kvittering: kv.id, p_metode: 'kvittering', p_bilde: null,
        });
        if (stykk && ider?.length) await rpc('sett_stykkvis', { p_pakning: ider[0], p_verdi: true });
        n += l.antall;
      }
      const utgifter = ekstra.map((l) => ({ husstand_id: husstand.id, kvittering_id: kv.id, type: l.type, tekst: l.tekst, antall: l.antall, belop: l.pris || 0, dato }));
      if (utgifter.length) {
        const { error: e2 } = await supabase.from('utgift').insert(utgifter);
        if (e2) throw new Error(e2.message);
      }
      // Avstem handlelisten mot det som faktisk ble kjøpt.
      let avstemt = null;
      try { avstemt = await rpc('avstem_handleliste', { p_kvittering: kv.id }); } catch { /* listen kan avstemmes senere */ }
      const tekst = avstemt && (avstemt.kjopt || avstemt.flagget)
        ? ` · handlelisten: ${avstemt.kjopt} kjøpt${avstemt.flagget ? `, ${avstemt.flagget} må sjekkes` : ''}` : '';
      vis(`${n} pakninger lagt inn fra ${k.butikk || 'kvitteringen'}${tekst}`);
      nullstill();
      if (avstemt?.flagget && gåTil) gåTil('handle');
    } catch (e) {
      vis(`Kunne ikke lagre: ${e.message}`);
    }
    setLagrer(false);
  }

  const rad = ([l, i]) => (
    <div key={i} className={`linje${l.med ? '' : ' av'}${l.sikker === false ? ' usikker' : ''}`}>
      <input type="checkbox" checked={l.med} aria-label="Ta med" onChange={(e) => endre(i, 'med', e.target.checked)} />
      <input value={l.vare || ''} aria-label="Vare" onChange={(e) => endre(i, 'vare', e.target.value)} />
      <input type="number" min="1" max="99" value={l.antall} aria-label="Antall" onChange={(e) => endre(i, 'antall', Math.max(1, parseInt(e.target.value, 10) || 1))} />
      <select value={l.lagringssted || 'skap'} aria-label="Lagringssted" onChange={(e) => endre(i, 'lagringssted', e.target.value)}>
        {STEDER.map(([id, navn]) => <option key={id} value={id}>{navn}</option>)}
      </select>
      <span className="pris">{kr(l.pris)}</span>
      <span className="rå">«{l.tekst}»{l.holdbarhet_dager ? ` · holder ca. ${l.holdbarhet_dager} d` : ''}{l.sikker === false && <em>Sjekk</em>}</span>
    </div>
  );

  if (fase === 'start') {
    return (
      <div className="kolonne">
        <Fotoknapp tekst="Ta bilde av kvitteringen" undertekst="Hele handlelaget registreres på én gang" onFil={påFil} ikon="kvittering" />
        <Fotoknapp tekst="Velg bilde eller PDF" onFil={påFil} kamera={false} aksepter="image/*,application/pdf" klasse="sekundær" ikon="bilde" />
        <p className="dempet">Legg kvitteringen flatt i godt lys. Lange kvitteringer kan tas i to bilder.</p>
      </div>
    );
  }
  if (fase === 'leser') return <p className="midt"><span className="spinn" /> Tolker kvitteringen …</p>;

  return (
    <div className="kort kvittering">
      <div className="hode"><h2>{k.butikk || 'Kvittering'}</h2><span className="dempet">{k.dato}</span></div>
      <div className="linjer">{mat.map(rad)}</div>
      {ekstra.length > 0 && (
        <div className="ekstra">
          <h3>Poser og pant</h3>
          {ekstra.map((l, i) => (
            <div key={i} className="ekstralinje"><span>{l.type === 'pose' ? 'Bærepose' : 'Pant'} · «{l.tekst}»{l.antall > 1 ? ` × ${l.antall}` : ''}</span><span className="pris">{kr(l.pris)} kr</span></div>
          ))}
          <div className="ekstralinje sum"><span>Poser {kr(sum('pose'))} kr · pant {kr(sum('pant'))} kr</span></div>
        </div>
      )}
      {ikkeMat.length > 0 && (
        <details><summary>Ikke mat: {ikkeMat.length} linjer (kan tas med)</summary><div className="linjer">{ikkeMat.map(rad)}</div></details>
      )}
      <p className={sumOk === false ? 'feil' : 'dempet'}>
        Linjesum {kr(sumLinjer)} kr{typeof k.total === 'number' ? ` mot kvitteringens ${kr(k.total)} kr – ${sumOk ? 'stemmer' : 'avvik, noe kan mangle'}` : ''}
      </p>
      <div className="valg">
        <button type="button" className="primær" disabled={lagrer} onClick={lagre}>{lagrer ? 'Lagrer …' : `Legg inn ${linjer.filter((l) => l.med).length} varer`}</button>
        <button type="button" className="lenke" onClick={nullstill}>Avbryt</button>
      </div>
    </div>
  );
}
