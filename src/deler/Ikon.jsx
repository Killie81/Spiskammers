// Enkle strekikoner (24×24), tegnet for Spiskammers.
const STIER = {
  ut: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
  inn: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  lager: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16" /></>,
  mer: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  kamera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></>,
  kvittering: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  bilde: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></>,
  søk: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  kjoleskap: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 10h12M9 5.5v2M9 13v3" /></>,
  fryser: <><path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" /><path d="m9 4 3 2 3-2M9 20l3-2 3 2" /></>,
  bod: <><path d="M3 8 12 3l9 5v12H3Z" /><path d="M9 20v-6h6v6" /></>,
  skap: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M12 3v18M10 11v2M14 11v2" /></>,
  skuffe: <><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="M3 12h18M10 8.5h4M10 15.5h4" /></>,
  klokke: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  åpnet: <><path d="M7 21h10l1-13H6Z" /><path d="M9 8V5a3 3 0 0 1 6 0" /></>,
  boks: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5Z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  pose: <><path d="M5 8h14l-1 13H6Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  søppel: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  kurv: <><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20.5 8H6.2" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></>,
  stjerne: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  sjekk: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  kryss: <path d="M6 6l12 12M18 6 6 18" />,
  prikker: <><circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" /></>,
  oppdater: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  angre: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
};

export default function Ikon({ navn, størrelse = 22, klasse = '' }) {
  return (
    <svg className={`ikon ${klasse}`} width={størrelse} height={størrelse} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {STIER[navn] || null}
    </svg>
  );
}

// Lagringssted som liten farget brikke med ikon.
export function StedMerke({ sted, størrelse = 18 }) {
  return <span className={`sted-merke sted-${sted}`}><Ikon navn={sted} størrelse={størrelse} /></span>;
}
