// Knapp som åpner iPadens eget kamera (eller filvelger). Kameraet er bare aktivt mens bildet tas.
export default function Fotoknapp({ tekst, onFil, kamera = true, aksepter = 'image/*', klasse = 'kamera', ikon = '●' }) {
  return (
    <label className={klasse}>
      <input
        type="file"
        accept={aksepter}
        {...(kamera ? { capture: 'environment' } : {})}
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFil(f); }}
      />
      {ikon && <span aria-hidden="true">{ikon}</span>} {tekst}
    </label>
  );
}
