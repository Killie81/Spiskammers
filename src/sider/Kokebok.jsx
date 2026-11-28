import { useEffect, useMemo, useState } from 'react';
import { supabase, hentLager, rpc, spørClaude, lastOppBilde } from '../supabase.js';
import { krympBilde, tilBase64 } from '../bilde.js';
import { grupper, gjettAvdeling } from '../format.js';
import { tolkLinje, ingrediensTekst, tilLinjer, sjekkMotLager, fraClaude } from '../oppskrift.js';
import Fotoknapp from '../deler/Fotoknapp.jsx';
import Ikon from '../deler/Ikon.jsx';

const tom = () => ({ navn: '', beskrivelse: '', porsjoner: 4, tid_min: null, kategori: 'middag', ingredienser: [], fremgangsmate: [], notat: '' });

export default function Kokebok({ husstand, vis, gåTil }) {
  const [oppskrifter, setOppskrifter] = useState([]);
  const [lager, setLager] = useState([]);
  const [visning, setVisning] = useState({ type: 'liste' }); // liste | ny | les | rediger
  const [filter, setFilter] = useState('favoritter');
  const [søk, setSøk] = useState('');
  const [ønske, setØnske] = useState('');
  const [forslag, setForslag] = useState(null);
  const [henter, setHenter] = useState(false);

  async function last() {
    const [{ data, error }, l] = await Promise.all([
      supabase.from('oppskrift').select('*').order('navn'),
      hentLager().catch(() => []),
    ]);
    if (error) vis(error.message); else setOppskrifter(data);
    setLager(l);
  }
  useEffect(() => { last(); }, []);

  // Favoritter først; tom favorittliste viser alle.
  const favoritter = oppskrifter.filter((o) => o.favoritt);
  const aktivtFilter = filter === 'favoritter' && !favoritter.length ? 'alle' : filter;
  const vist = (aktivtFilter === 'favoritter' ? favoritter : oppskrifter)
    .filter((o) => !søk || `${o.navn} ${(o.ingredienser || []).map((i) => i.navn).join(' ')}`.toLowerCase().includes(søk.toLowerCase()));

  async function foreslå() {
    setHenter(true); setForslag(null);
    try {
      const r = await spørClaude({
        modus: 'middag', antall: 3, ønske: ønske.trim() || null,
        lager: grupper(lager).map((p) => ({ navn: p.navn, sted: p.sted, andel: Number(p.andel), holdbarhet: p.holdbarhet, antall: p.antall })),
        favoritter: favoritter.map((o) => o.navn),
      });
      setForslag((r.forslag || []).map((f) => ({ ...fraClaude(f), hvorfor: f.hvorfor, bruker: f.bruker || [] })));
    } catch (e) { vis(`Fikk ikke forslag: ${e.message}`); }
    setHenter(false);
  }

  async function lagre(o) {
    const rad = {
      navn: o.navn.trim() || 'Uten navn', beskrivelse: o.beskrivelse || null, porsjoner: o.porsjoner || 4, tid_min: o.tid_min || null,
      kategori: o.kategori || 'middag', ingredienser: o.ingredienser, fremgangsmate: o.fremgangsmate, notat: o.notat || null,
      kilde: o.kilde || null, bilde_sti: o.bilde_sti || null, favoritt: Boolean(o.favoritt),
    };
    const svar = o.id
      ? await supabase.from('oppskrift').update(rad).eq('id', o.id).select().single()
      : await supabase.from('oppskrift').insert({ ...rad, husstand_id: husstand.id }).select().single();
    if (svar.error) { vis(`Kunne ikke lagre: ${svar.error.message}`); return null; }
    vis(`${svar.data.navn} er lagret i kokeboka`);
    setOppskrifter((os) => [...os.filter((x) => x.id !== svar.data.id), svar.data].sort((a, b) => a.navn.localeCompare(b.navn, 'nb')));
    return svar.data;
  }

  async function oppdater(o, endring) {
    const { data, error } = await supabase.from('oppskrift').update(endring).eq('id', o.id).select().single();
    if (error) { vis(error.message); return o; }
    setOppskrifter((os) => os.map((x) => (x.id === o.id ? data : x)));
    return data;
  }

  async function slett(o) {
    const { error } = await supabase.from('oppskrift').delete().eq('id', o.id);
    if (error) return vis(error.message);
    setOppskrifter((os) => os.filter((x) => x.id !== o.id));
    vis(`${o.navn} er slettet`);
    setVisning({ type: 'liste' });
  }

  async function påHandlelisten(o, ingredienser) {
    try {
      for (const i of ingredienser) await rpc('legg_til_fra_oppskrift', { p_navn: i.navn.charAt(0).toUpperCase() + i.navn.slice(1), p_oppskrift: o.navn, p_avdeling: gjettAvdeling(i.navn) });
      vis(`${ingredienser.length} ${ingredienser.length === 1 ? 'vare' : 'varer'} lagt på handlelisten`);
    } catch (e) { vis(`Kunne ikke legge på listen: ${e.message}`); }
  }

  if (visning.type === 'les') {
    return (
      <OppskriftVisning o={visning.o} lager={lager}
        onTilbake={() => setVisning({ type: 'liste' })}
        onLagre={async (o) => { const ny = await lagre(o); if (ny) setVisning({ type: 'les', o: ny }); }}
        onFavoritt={async (o) => setVisning({ type: 'les', o: o.id ? await oppdater(o, { favoritt: !o.favoritt }) : { ...o, favoritt: !o.favoritt } })}
        onLaget={async (o) => { const ny = await oppdater(o, { antall_laget: (o.antall_laget || 0) + 1, sist_laget: new Date().toISOString().slice(0, 10) }); setVisning({ type: 'les', o: ny }); vis('Notert. Husk å ta ut det dere brukte fra lageret.'); }}
        onRediger={(o) => setVisning({ type: 'rediger', o })}
        onSlett={slett}
        onHandleliste={påHandlelisten}
        gåTil={gåTil} />
    );
  }
  if (visning.type === 'rediger') {
    return (
      <Redigering o={visning.o}
        onAvbryt={() => setVisning(visning.o.id ? { type: 'les', o: visning.o } : { type: 'liste' })}
        onLagre={async (o) => { const ny = await lagre(o); if (ny) setVisning({ type: 'les', o: ny }); }} />
    );
  }
  if (visning.type === 'ny') {
    return <NyOppskrift husstand={husstand} vis={vis} onAvbryt={() => setVisning({ type: 'liste' })} onKlar={(o) => setVisning({ type: 'rediger', o })} />;
  }

  return (
    <section className="kolonne kokebok">
      <div className="kort middagskort">
        <h2>Hva skal vi ha til middag?</h2>
        <p className="dempet">Claude ser i lageret og foreslår retter som bruker det dere har – det som går ut først, prioriteres.</p>
        <input placeholder="Ønsker? F.eks. rask, fisk, noe barna liker" value={ønske} onChange={(e) => setØnske(e.target.value)} aria-label="Ønsker til middagen" />
        <button type="button" className="primær stor" disabled={henter} onClick={foreslå}>
          {henter ? <><span className="spinn" /> Ser i lageret …</> : 'Foreslå middag'}
        </button>
      </div>

      {forslag && (
        <div className="forslagliste">
          {forslag.map((f, n) => {
            const sjekk = sjekkMotLager(f.ingredienser, lager);
            const mangler = sjekk.filter((i) => i.status === 'mangler');
            const har = sjekk.filter((i) => i.status !== 'mangler').length;
            return (
              <article key={n} className="kort forslag">
                <h3>{f.navn}</h3>
                <p className="hvorfor">{f.hvorfor}</p>
                <p className="dempet">{[f.tid_min && `${f.tid_min} min`, `har ${har} av ${sjekk.length} ingredienser`].filter(Boolean).join(' · ')}</p>
                {mangler.length > 0 && <p className="mangler">Mangler: {mangler.map((i) => i.navn).join(', ')}</p>}
                <div className="valg">
                  <button type="button" className="primær" onClick={() => setVisning({ type: 'les', o: f })}>Se oppskrift</button>
                  {mangler.length > 0 && <button type="button" onClick={() => påHandlelisten(f, mangler)}>Legg {mangler.length} på listen</button>}
                </div>
              </article>
            );
          })}
          <button type="button" className="lenke" onClick={foreslå} disabled={henter}>Andre forslag</button>
        </div>
      )}

      <div className="kokebok-hode">
        <h2>Kokeboka</h2>
        <button type="button" className="primær" onClick={() => setVisning({ type: 'ny' })}><Ikon navn="inn" størrelse={18} /> Ny oppskrift</button>
      </div>
      {oppskrifter.length > 0 && (
        <>
          <div className="bryter">
            <button type="button" className={aktivtFilter === 'favoritter' ? 'på' : ''} onClick={() => setFilter('favoritter')} disabled={!favoritter.length}>
              <Ikon navn="stjerne" størrelse={16} /> Favoritter{favoritter.length ? ` (${favoritter.length})` : ''}
            </button>
            <button type="button" className={aktivtFilter === 'alle' ? 'på' : ''} onClick={() => setFilter('alle')}>Alle ({oppskrifter.length})</button>
          </div>
          <input type="search" placeholder="Søk etter rett eller ingrediens" value={søk} onChange={(e) => setSøk(e.target.value)} aria-label="Søk i kokeboka" />
        </>
      )}
      <ul className="oppskriftliste">
        {vist.map((o) => {
          const sjekk = sjekkMotLager(o.ingredienser, lager);
          const har = sjekk.filter((i) => i.status !== 'mangler').length;
          return (
            <li key={o.id}>
              <button type="button" onClick={() => setVisning({ type: 'les', o })}>
                <span className="navn">
                  <b>{o.favoritt && <Ikon navn="stjerne" størrelse={15} />} {o.navn}</b>
                  <small className="dempet">{[o.tid_min && `${o.tid_min} min`, `${o.porsjoner} porsjoner`, o.antall_laget ? `laget ${o.antall_laget} ganger` : null].filter(Boolean).join(' · ')}</small>
                </span>
                <span className={`dekning${har === sjekk.length ? ' full' : ''}`}>{har}/{sjekk.length}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!oppskrifter.length && (
        <p className="tomt">Kokeboka er tom. Legg inn en oppskrift med bilde, lenke eller tekst – eller lagre et middagsforslag.</p>
      )}
    </section>
  );
}

function NyOppskrift({ husstand, vis, onAvbryt, onKlar }) {
  const [tekst, setTekst] = useState('');
  const [leser, setLeser] = useState(false);

  async function tolk(body, ekstra = {}) {
    setLeser(true);
    try {
      const r = await spørClaude({ modus: 'oppskrift', ...body });
      onKlar({ ...fraClaude(r), ...ekstra });
    } catch (e) { vis(`Kunne ikke lese oppskriften: ${e.message}`); setLeser(false); }
  }

  async function påFil(fil) {
    if (fil.type === 'application/pdf') return tolk({ bilde: await tilBase64(fil), mediaType: 'application/pdf' }, { kilde: fil.name });
    const { blob } = await krympBilde(fil, 2400);
    const sti = await lastOppBilde(husstand.id, blob, 'oppskrift');
    return tolk({ bilde: await tilBase64(blob) }, { bilde_sti: sti, kilde: 'Bilde' });
  }

  const erLenke = /^https?:\/\/\S+$/i.test(tekst.trim());

  if (leser) return <section className="kolonne"><div className="kort leser"><span className="spinn" /> Claude leser oppskriften …</div></section>;
  return (
    <section className="kolonne">
      <button type="button" className="lenke tilbake" onClick={onAvbryt}>← Kokeboka</button>
      <h2>Ny oppskrift</h2>
      <Fotoknapp tekst="Ta bilde av oppskriften" undertekst="Fra kokebok, blad eller håndskrevet lapp" onFil={påFil} ikon="kamera" />
      <Fotoknapp tekst="Velg bilde eller PDF" onFil={påFil} kamera={false} aksepter="image/*,application/pdf" klasse="sekundær" ikon="bilde" />
      <div className="kort skjema">
        <label>Lim inn lenke eller tekst
          <textarea rows={5} placeholder="https://www.matprat.no/oppskrifter/… eller hele oppskriften" value={tekst} onChange={(e) => setTekst(e.target.value)} />
        </label>
        <button type="button" className="primær" disabled={!tekst.trim()} onClick={() => tolk(erLenke ? { url: tekst.trim() } : { tekst }, { kilde: erLenke ? tekst.trim() : null })}>
          {erLenke ? 'Hent fra lenken' : 'Les teksten'}
        </button>
      </div>
      <div className="valg"><button type="button" onClick={() => onKlar(tom())}>Skriv inn selv</button></div>
    </section>
  );
}

function Redigering({ o, onAvbryt, onLagre }) {
  const [f, setF] = useState({ ...o, ingTekst: tilLinjer(o.ingredienser), stegTekst: (o.fremgangsmate || []).join('\n') });
  const sett = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [lagrer, setLagrer] = useState(false);
  async function lagre() {
    setLagrer(true);
    await onLagre({
      ...f,
      porsjoner: parseInt(f.porsjoner, 10) || 4,
      tid_min: parseInt(f.tid_min, 10) || null,
      ingredienser: f.ingTekst.split('\n').map(tolkLinje).filter(Boolean),
      fremgangsmate: f.stegTekst.split('\n').map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean),
    });
    setLagrer(false);
  }
  return (
    <section className="kolonne">
      <button type="button" className="lenke tilbake" onClick={onAvbryt}>← Avbryt</button>
      <div className="kort skjema">
        <h2>{o.id ? 'Rediger oppskrift' : o.navn ? 'Sjekk oppskriften' : 'Ny oppskrift'}</h2>
        <label>Navn<input value={f.navn} onChange={(e) => sett('navn', e.target.value)} /></label>
        <label>Kort beskrivelse<input value={f.beskrivelse || ''} onChange={(e) => sett('beskrivelse', e.target.value)} /></label>
        <div className="to">
          <label>Porsjoner<input inputMode="numeric" value={f.porsjoner ?? ''} onChange={(e) => sett('porsjoner', e.target.value)} /></label>
          <label>Tid (min)<input inputMode="numeric" value={f.tid_min ?? ''} onChange={(e) => sett('tid_min', e.target.value)} /></label>
        </div>
        <label>Ingredienser<small className="dempet"> – én per linje, f.eks. «400 g kjøttdeig»</small>
          <textarea rows={Math.max(6, f.ingTekst.split('\n').length + 1)} value={f.ingTekst} onChange={(e) => sett('ingTekst', e.target.value)} />
        </label>
        <label>Fremgangsmåte<small className="dempet"> – ett steg per linje</small>
          <textarea rows={Math.max(5, f.stegTekst.split('\n').length + 1)} value={f.stegTekst} onChange={(e) => sett('stegTekst', e.target.value)} />
        </label>
        <label>Notat<input placeholder="F.eks. dobbel porsjon sauce, barna liker den mild" value={f.notat || ''} onChange={(e) => sett('notat', e.target.value)} /></label>
        <label className="avkryss"><input type="checkbox" checked={Boolean(f.favoritt)} onChange={(e) => sett('favoritt', e.target.checked)} /><span>Favorittrett</span></label>
        <div className="valg">
          <button type="button" className="primær" disabled={lagrer || !f.navn.trim()} onClick={lagre}>Lagre i kokeboka</button>
          <button type="button" className="lenke" onClick={onAvbryt}>Avbryt</button>
        </div>
      </div>
    </section>
  );
}

function OppskriftVisning({ o, lager, onTilbake, onLagre, onFavoritt, onLaget, onRediger, onSlett, onHandleliste, gåTil }) {
  const [porsjoner, setPorsjoner] = useState(o.porsjoner || 4);
  const faktor = porsjoner / (o.porsjoner || 4);
  const sjekk = useMemo(() => sjekkMotLager(o.ingredienser, lager), [o, lager]);
  // Det som mangler, er krysset av for handlelisten. Har dere det likevel, fjern krysset.
  const [valgt, setValgt] = useState(() => new Set(sjekk.map((i, n) => (i.status === 'mangler' ? n : null)).filter((n) => n !== null)));
  const [slettBekreft, setSlettBekreft] = useState(false);
  const [lagtTil, setLagtTil] = useState(false);
  const bytt = (n) => setValgt((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const har = sjekk.filter((i) => i.status !== 'mangler').length;

  return (
    <section className="kolonne oppskrift">
      <button type="button" className="lenke tilbake" onClick={onTilbake}>← Kokeboka</button>
      <div className="kort">
        <div className="oppskrift-hode">
          <div>
            <h2>{o.navn}</h2>
            {o.beskrivelse && <p className="dempet">{o.beskrivelse}</p>}
            <p className="dempet">{[o.tid_min && `${o.tid_min} min`, o.antall_laget ? `laget ${o.antall_laget} ganger` : null].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className={`stjerneknapp${o.favoritt ? ' på' : ''}`} aria-label={o.favoritt ? 'Fjern som favoritt' : 'Gjør til favoritt'} onClick={() => onFavoritt(o)}>
            <Ikon navn="stjerne" størrelse={26} />
          </button>
        </div>
        {o.hvorfor && <p className="hvorfor">{o.hvorfor}</p>}
        {o.notat && <p className="notat">{o.notat}</p>}

        <div className="porsjoner">
          <span className="etikett">Porsjoner</span>
          <div className="teller">
            <button type="button" aria-label="Færre porsjoner" disabled={porsjoner <= 1} onClick={() => setPorsjoner(porsjoner - 1)}>−</button>
            <b>{porsjoner}</b>
            <button type="button" aria-label="Flere porsjoner" onClick={() => setPorsjoner(porsjoner + 1)}>+</button>
          </div>
        </div>

        <h3>Ingredienser <small className="dempet">· har {har} av {sjekk.length}</small></h3>
        <ul className="ingredienser">
          {sjekk.map((i, n) => (
            <li key={n} className={i.status}>
              {i.status === 'mangler' || valgt.has(n)
                ? <label><input type="checkbox" checked={valgt.has(n)} onChange={() => bytt(n)} /><span>{ingrediensTekst(i, faktor)}</span><small>mangler</small></label>
                : <label><span className="ok"><Ikon navn="sjekk" størrelse={16} /></span><span>{ingrediensTekst(i, faktor)}</span>
                    <small>{i.status === 'basis' ? 'har dere sikkert' : `${i.treff.navn}`}</small>
                    <button type="button" className="lenke" onClick={() => bytt(n)}>Kjøp</button></label>}
            </li>
          ))}
        </ul>
        {valgt.size > 0 && !lagtTil && (
          <button type="button" className="primær stor" onClick={async () => { await onHandleliste(o, [...valgt].map((n) => sjekk[n])); setLagtTil(true); }}>
            Legg {valgt.size} på handlelisten
          </button>
        )}
        {lagtTil && <button type="button" onClick={() => gåTil('handle')}>Gå til handlelisten</button>}

        {(o.fremgangsmate || []).length > 0 && (
          <>
            <h3>Slik gjør du</h3>
            <ol className="steg">{o.fremgangsmate.map((s, n) => <li key={n}>{s}</li>)}</ol>
          </>
        )}
        {o.kilde && /^https?:/.test(o.kilde) && <p className="dempet kilde"><a href={o.kilde} target="_blank" rel="noreferrer">Original oppskrift</a></p>}
      </div>

      <div className="valg">
        {o.id ? (
          <>
            <button type="button" className="primær" onClick={() => onLaget(o)}>Vi lagde denne i dag</button>
            <button type="button" onClick={() => onRediger(o)}>Rediger</button>
            {slettBekreft
              ? <button type="button" className="kastet" onClick={() => onSlett(o)}>Ja, slett</button>
              : <button type="button" className="lenke" onClick={() => setSlettBekreft(true)}>Slett</button>}
          </>
        ) : (
          <>
            <button type="button" className="primær" onClick={() => onLagre(o)}>Lagre i kokeboka</button>
            <button type="button" onClick={() => onRediger(o)}>Rediger først</button>
          </>
        )}
      </div>
    </section>
  );
}
