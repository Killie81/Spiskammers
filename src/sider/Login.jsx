import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState('');
  const [venter, setVenter] = useState(false);

  async function logginn(e) {
    e.preventDefault();
    setVenter(true); setFeil('');
    const { error } = await supabase.auth.signInWithPassword({ email: epost.trim(), password: passord });
    setVenter(false);
    if (error) setFeil('Feil e-post eller passord.');
  }

  return (
    <main className="sentrert">
      <form className="kort login" onSubmit={logginn}>
        <h1>Spiskammers</h1>
        <p className="dempet">Logg inn med husstandens felles konto.</p>
        <label>E-post<input type="email" autoComplete="username" value={epost} onChange={(e) => setEpost(e.target.value)} required /></label>
        <label>Passord<input type="password" autoComplete="current-password" value={passord} onChange={(e) => setPassord(e.target.value)} required /></label>
        {feil && <p className="feil">{feil}</p>}
        <button className="primær" type="submit" disabled={venter}>{venter ? 'Logger inn …' : 'Logg inn'}</button>
      </form>
    </main>
  );
}
