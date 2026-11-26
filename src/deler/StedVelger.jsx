import Ikon from './Ikon.jsx';
import { STEDER } from '../format.js';

// Store ikonknapper for lagringsstedene. Brukes til filter i Lager, valg ved innlegging og snarveier på startskjermen.
// tall: { kjoleskap: 4, … } viser antall under navnet. medAlle legger til «Alle» først.
export default function StedVelger({ valgt, onVelg, tall, medAlle = false, klasse = '' }) {
  const valg = [...(medAlle ? [['alle', 'Alle']] : []), ...STEDER];
  return (
    <div className={`stedvelger n${valg.length} ${klasse}`} role="group" aria-label="Lagringssted">
      {valg.map(([id, navn]) => (
        <button key={id} type="button" className={`stedknapp sted-${id}${valgt === id ? ' på' : ''}`} aria-pressed={valgt === id}
          onClick={() => onVelg(id)}>
          <span className="stedknapp-ikon"><Ikon navn={id === 'alle' ? 'lager' : id} størrelse={22} /></span>
          <span className="stedknapp-navn">{navn}</span>
          {tall && <span className="stedknapp-tall">{tall[id] ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}

export function tellPerSted(lager) {
  const t = { alle: lager.length };
  for (const p of lager) t[p.sted] = (t[p.sted] || 0) + 1;
  return t;
}
