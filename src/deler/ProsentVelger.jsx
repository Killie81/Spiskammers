// Mengde i prosent: hurtigknapper og en glidebryter for nøyaktig verdi.
export default function ProsentVelger({ verdi, onEndre, valg = [100, 75, 50, 25], etikett }) {
  const p = Math.round((verdi ?? 1) * 100);
  return (
    <div className="prosentvelger">
      <div className="prosent-hode">
        {etikett && <span className="etikett">{etikett}</span>}
        <b>{p} %</b>
      </div>
      <input type="range" min="0" max="100" step="5" value={p} aria-label={etikett || 'Prosent'}
        onChange={(e) => onEndre(Number(e.target.value) / 100)} style={{ '--p': `${p}%` }} />
      <div className="valg">
        {valg.map((v) => (
          <button key={v} type="button" className={p === v ? 'på' : ''} onClick={() => onEndre(v / 100)}>{v === 100 ? 'Full' : `${v} %`}</button>
        ))}
      </div>
    </div>
  );
}
