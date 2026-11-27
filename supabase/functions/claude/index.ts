// Spiskammers – serverfunksjon som kaller Claude.
// API-nøkkelen ligger som hemmelighet (ANTHROPIC_API_KEY) i Supabase, aldri i appen.
// Moduser: "vare" (registrering inn), "uttak" (match mot lager + rest), "kvittering".
// Bare innloggede brukere slipper gjennom: den offentlige app-nøkkelen alene er ikke nok.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5-5";

type Kandidat = { id: string; navn: string; merke?: string | null; ean?: string | null; sted: string; andel: number; holdbarhet?: string | null };

const STEDER = "fryser, kjoleskap, bod, skap, skuffe";
const KATEGORIER = "drikke, meieri, kjott, fisk, frukt_gront, brod_bakst, torrvarer, hermetikk, frossen, palegg, hjemmelaget, annet";

function idag() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function promptVare(ean: string | null) {
  return `Du ser et bilde av en matvare som skal registreres i en norsk husholdnings matlager.
${ean ? `Strekkoden er lest lokalt: ${ean}. Bruk den.` : "Ingen strekkode ble lest lokalt. Les sifrene hvis strekkoden er synlig."}
Dagens dato er ${idag()}. Mangler året i en dato på pakningen, bruk det nærmeste året som gir en dato fremover i tid.
Svar KUN med ett JSON-objekt:
{"vare": kort norsk varenavn slik det står på pakningen, "merke": streng eller null, "kategori": en av ${KATEGORIER},
 "ean": 8 eller 13 siffer eller null, "pakning_mengde": tall for hele pakningens innhold eller null, "pakning_enhet": "ml", "g" eller "stk",
 "andel_igjen": 0 til 1 avrundet til nærmeste 0,05 (1 = full/uåpnet) eller null, "holdbarhet": "ÅÅÅÅ-MM-DD" eller null,
 "dato_type": "best_for", "siste_forbruksdag" eller null, "lagringssted": en av ${STEDER}, "sikkerhet": "lav", "middels" eller "hoy",
 "alternativer": liste med inntil 2 andre varer det kan være,
 "vekt_g": står varen på en kjøkkenvekt, tallet på displayet i gram (kg ganges med 1000), ellers null,
 "stykkvis": true for frukt og grønt som brukes ett og ett stykk (bananer, appelsiner, klementiner, epler, pærer, kiwi, avokado, sitroner o.l.), ellers false,
 "antall_stk": for stykkvarer antall stykker på bildet, ellers null}`;
}

function promptUttak(ean: string | null, kandidater: Kandidat[]) {
  const liste = kandidater.map((k) =>
    `- id=${k.id} | ${k.navn}${k.merke ? ` (${k.merke})` : ""}${k.ean ? ` | EAN ${k.ean}` : ""} | ${k.sted} | ${Math.round(k.andel * 100)} % igjen${k.holdbarhet ? ` | holdbar til ${k.holdbarhet}` : ""}`
  ).join("\n");
  return `Du ser et bilde av en matvare som tas ut av en norsk husholdnings matlager.
${ean ? `Strekkoden er lest lokalt: ${ean}.` : "Ingen strekkode ble lest lokalt."}
Dette er pakningene som ligger på lager nå:
${liste || "(lageret er tomt)"}
Finn pakningen på bildet i listen. Finnes flere like, velg den som er åpnet (under 100 %), ellers den med kortest holdbarhet.
Anslå også hvor mye som er igjen i pakningen på bildet.
Svar KUN med ett JSON-objekt:
{"pakning_id": id fra listen eller null hvis varen ikke finnes på lager, "vare": kort norsk navn på det du ser,
 "andel_igjen": 0 til 1 avrundet til nærmeste 0,05 eller null hvis det ikke kan sees, "grunnlag_mengde": én kort setning,
 "sikkerhet": "lav", "middels" eller "hoy", "alternative_ider": inntil 2 andre id-er fra listen det kan være,
 "vekt_g": står varen på en kjøkkenvekt, tallet på displayet i gram (kg ganges med 1000), ellers null,
 "antall_stk": er varen frukt o.l. som telles i stk, antall stykker på bildet, ellers null}`;
}

function promptKvittering() {
  return `Du ser en kvittering fra en norsk dagligvarebutikk. Tolk den slik at varene kan registreres i en husholdnings matlager.
Dagens dato er ${idag()}.
Regler:
- Én linje per vare. Står samme vare flere ganger, slå dem sammen og øk antall.
- Rabatter, kampanjer og "x for y" trekkes fra prisen på varen de gjelder og er ikke egne linjer.
- Pant, bæreposer og varer som ikke er mat eller drikke tas med, men merkes med riktig type.
- Stykkvarer: frukt og grønt som brukes ett og ett stykk (bananer, appelsiner, klementiner, epler, pærer, kiwi, avokado, sitroner o.l.) får stykkvis true, antall = antall stykker, pakning_mengde 1 og pakning_enhet "stk".
  Er de kjøpt i løsvekt eller nett, anslå antall stykker fra vekten (banan ca. 180 g, eple og pære ca. 180 g, appelsin ca. 200 g, klementin ca. 70 g, kiwi ca. 90 g, avokado ca. 200 g, sitron ca. 120 g).
- Annen løsvekt (grønnsaker, ost i disk) får antall 1 og vekten som pakning_mengde i g.
- Anslå typisk holdbarhet i dager fra kjøp for hver matvare.
- Er du usikker på en forkortelse, gjett beste vare og sett sikker til false.
Svar KUN med ett JSON-objekt:
{"butikk": streng eller null, "dato": "ÅÅÅÅ-MM-DD" eller null, "total": tall eller null,
 "linjer": [{"tekst": teksten på kvitteringen, "vare": kort norsk varenavn, "kategori": en av ${KATEGORIER}, "antall": heltall,
 "pakning_mengde": tall eller null, "pakning_enhet": "ml", "g" eller "stk", "pris": linjens totalpris etter rabatt,
 "type": "mat", "pant", "pose" eller "ikke_mat", "lagringssted": en av ${STEDER}, "holdbarhet_dager": heltall eller null, "stykkvis": true eller false, "sikker": true eller false}]}`;
}

// Supabase gir funksjonen prosjektets offentlige nøkkel, enten som gammel anon-nøkkel eller ny publishable-nøkkel.
function offentligNøkkel(): string {
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) return anon;
  try {
    const v = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return String(Object.values(v)[0] ?? "");
  } catch {
    return "";
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ feil: "Bruk POST" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, offentligNøkkel(), { auth: { persistSession: false } });
  const { data: bruker, error: authFeil } = await sb.auth.getUser(token);
  if (authFeil || !bruker?.user) return json({ feil: "Ikke innlogget" }, 401);

  const key = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (!key) return json({ feil: "ANTHROPIC_API_KEY mangler i Supabase" }, 500);
  // En gyldig nøkkel er én sammenhengende tekst som starter med sk-ant-. Sjekk før bruk, så nøkkelen aldri havner i en feilmelding.
  if (!/^sk-ant-[A-Za-z0-9_-]+$/.test(key)) {
    return json({ feil: "ANTHROPIC_API_KEY i Supabase har feil format. Lim inn bare nøkkelen (sk-ant-…), uten annen tekst." }, 500);
  }

  let input: { modus: string; bilde: string; mediaType?: string; ean?: string | null; kandidater?: Kandidat[] };
  try { input = await req.json(); } catch { return json({ feil: "Ugyldig forespørsel" }, 400); }
  if (!input?.bilde) return json({ feil: "Bilde mangler" }, 400);

  const prompt = input.modus === "kvittering" ? promptKvittering()
    : input.modus === "uttak" ? promptUttak(input.ean ?? null, (input.kandidater ?? []).slice(0, 300))
    : promptVare(input.ean ?? null);

  const mediaType = input.mediaType ?? "image/jpeg";
  const kilde = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.bilde } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: input.bilde } };

  let svar: Response;
  try {
    svar = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: input.modus === "kvittering" ? 4000 : 800,
        messages: [{ role: "user", content: [kilde, { type: "text", text: prompt }] }],
      }),
    });
  } catch {
    // Ikke logg eller returner selve feilen: den kan inneholde nøkkelen.
    return json({ feil: "Fikk ikke kontakt med Claude. Prøv igjen om litt." }, 502);
  }

  if (!svar.ok) {
    const t = await svar.text();
    return json({ feil: `Claude svarte ${svar.status}`, detalj: t.slice(0, 500) }, 502);
  }
  const data = await svar.json();
  const tekst: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const m = tekst.match(/\{[\s\S]*\}/);
  if (!m) return json({ feil: "Svaret var ikke JSON", detalj: tekst.slice(0, 300) }, 502);
  try {
    return json({ resultat: JSON.parse(m[0]), bruk: data.usage });
  } catch {
    return json({ feil: "Kunne ikke lese svaret", detalj: tekst.slice(0, 300) }, 502);
  }
});
