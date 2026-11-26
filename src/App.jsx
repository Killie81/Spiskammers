import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, konfigurert, rpc } from './supabase.js';
import Login from './sider/Login.jsx';
import Uttak from './sider/Uttak.jsx';
import Inn from './sider/Inn.jsx';
import Lager from './sider/Lager.jsx';
import Mer from './sider/Mer.jsx';

const FANER = [
  ['uttak', 'Ta ut'],
  ['inn', 'Legg inn'],
  ['lager', 'Lager'],
  ['mer', 'Mer'],
];

export default function App() {
  const [økt, setØkt] = useState(undefined);
  const [husstand, setHusstand] = useState(null);
  const [fane, setFane] = useState('uttak');
  const [melding, setMelding] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!konfigurert) return;
    supabase.auth.getSession().then(({ data }) => setØkt(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setØkt(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!økt) { setHusstand(null); return; }
    (async () => {
      const id = await rpc('opprett_husstand', { p_navn: 'Hjemme' });
      const { data } = await supabase.from('husstand').select('*').eq('id', id).single();
      setHusstand(data);
    })().catch((e) => vis(`Kunne ikke hente husstand: ${e.message}`));
  }, [økt]);

  // Melding nederst, eventuelt med Angre.
  const vis = useCallback((tekst, angre) => {
    clearTimeout(timer.current);
    setMelding({ tekst, angre });
    timer.current = setTimeout(() => setMelding(null), angre ? 8000 : 4000);
  }, []);

  if (!konfigurert) {
    return <main className="sentrert"><h1>Spiskammers</h1><p>Appen mangler kobling til Supabase. Se docs/OPPSETT.md.</p></main>;
  }
  if (økt === undefined) return <main className="sentrert"><span className="spinn" /></main>;
  if (!økt) return <Login />;
  if (!husstand) return <main className="sentrert"><span className="spinn" /></main>;

  const felles = { husstand, setHusstand, vis, gåTil: setFane };

  return (
    <div className="app">
      <nav className="faner">
        <span className="merke">Spiskammers</span>
        {FANER.map(([id, navn]) => (
          <button key={id} type="button" className={fane === id ? 'på' : ''} onClick={() => setFane(id)}>{navn}</button>
        ))}
      </nav>
      <main className="innhold">
        {fane === 'uttak' && <Uttak {...felles} />}
        {fane === 'inn' && <Inn {...felles} />}
        {fane === 'lager' && <Lager {...felles} />}
        {fane === 'mer' && <Mer {...felles} />}
      </main>
      {melding && (
        <div className="melding" role="status">
          <span>{melding.tekst}</span>
          {melding.angre && (
            <button type="button" onClick={async () => {
              setMelding(null);
              try { await melding.angre(); vis('Angret'); } catch (e) { vis(`Kunne ikke angre: ${e.message}`); }
            }}>Angre</button>
          )}
        </div>
      )}
    </div>
  );
}
