import Ikon from './Ikon.jsx';

// Knapp som åpner iPadens eget kamera (eller filvelger). Kameraet er bare aktivt mens bildet tas.
export default function Fotoknapp({ tekst, undertekst, onFil, kamera = true, aksepter = 'image/*', klasse = 'kamera', ikon = 'kamera' }) {
  return (
    <label className={klasse}>
      <input
        type="file"
        accept={aksepter}
        {...(kamera ? { capture: 'environment' } : {})}
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFil(f); }}
      />
      {ikon && <span className="knapp-ikon"><Ikon navn={ikon} størrelse={klasse === 'kamera' ? 34 : 20} /></span>}
      <span className="knapp-tekst"><span>{tekst}</span>{undertekst && <small>{undertekst}</small>}</span>
    </label>
  );
}
