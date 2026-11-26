import { dagerIgjen, holdbarTekst } from '../format.js';

export function Restbar({ andel }) {
  return (
    <span className="restbar" aria-label={`${Math.round(andel * 100)} prosent igjen`}>
      <span style={{ width: `${Math.round(andel * 100)}%` }} />
    </span>
  );
}

export function Holdbar({ dato, type }) {
  const d = dagerIgjen(dato);
  const nivå = d == null ? 'ingen' : d <= 2 ? 'varsel' : d <= 5 ? 'snart' : 'ok';
  return <span className={`frist frist-${nivå}`}>{holdbarTekst(dato)}{type === 'anslag' && dato ? ' ≈' : ''}</span>;
}
