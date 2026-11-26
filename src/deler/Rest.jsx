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
  const klasse = d == null ? 'dempet' : d <= 2 ? 'varsel' : d <= 5 ? 'snart' : 'dempet';
  return <span className={klasse}>{holdbarTekst(dato)}{type === 'anslag' && dato ? ' (anslag)' : ''}</span>;
}
