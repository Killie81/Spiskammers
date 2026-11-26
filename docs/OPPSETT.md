# Oppsett av Spiskammers

Gjøres én gang. Det tar 20–30 minutter. Menyene hos tjenestene kan hete litt annerledes enn her, men stegene er de samme.

API-nøkler og passord limes inn direkte hos tjenestene. De skal aldri sendes i chatten.

## 1. Anthropic Console – nøkkel til Claude

1. Gå til https://console.anthropic.com og logg inn.
2. **Billing:** legg inn kort og kjøp kreditt, f.eks. 10 dollar.
3. **Limits:** sett en månedlig grense, f.eks. 10 dollar, så kostnaden aldri løper løpsk.
4. **API Keys → Create Key:** kall den `spiskammers`. Kopier nøkkelen, og la fanen stå åpen til steg 2.5.

## 2. Supabase – database og serverfunksjon

1. Gå til https://supabase.com/dashboard og velg **New project**.
   - Navn: `spiskammers`
   - Region: **Stockholm (eu-north-1)**
   - Databasepassord: lag et sterkt passord og lagre det trygt
2. **Databasen:** åpne **SQL Editor → New query**. Åpne filen `supabase/migrations/20261126000000_init.sql` i GitHub-repoet, kopier alt og lim det inn. Trykk **Run**. Svaret skal være «Success. No rows returned».
3. **Stopp nye registreringer:** gå til **Authentication → Sign In / Providers** og slå av **Allow new users to sign up**. Da kan bare husstandens konto bruke appen og Claude-nøkkelen.
4. **Husstandskontoen:** gå til **Authentication → Users → Add user → Create new user**. Skriv inn e-post og et passord dere deler i familien, og huk av for **Auto Confirm User**.
5. **Claude-nøkkelen:** gå til **Edge Functions → Secrets**, eller **Project Settings → Edge Functions**. Legg til:
   - Name: `ANTHROPIC_API_KEY`
   - Value: nøkkelen fra steg 1.4
6. **Serverfunksjonen:** gå til **Edge Functions → Deploy a new function → Via Editor**.
   - Navn: `claude`, med små bokstaver
   - Slett eksempelkoden og lim inn hele `supabase/functions/claude/index.ts` fra repoet
   - Trykk **Deploy function**
   - Under **Settings** for funksjonen: slå **av** «Verify JWT with legacy secret» og lagre. Funksjonen sjekker selv at brukeren er innlogget.
7. **Adressene til appen:** gå til **Project Settings → API**, eventuelt **Data API** og **API Keys**. Ta vare på to verdier til steg 3:
   - **Project URL**, f.eks. `https://abcd1234.supabase.co`
   - **Publishable key** (eller **anon public** i eldre prosjekter). Den er laget for å ligge i appen og er ikke hemmelig.

## 3. Vercel – publisering av appen

1. Gå til https://vercel.com og logg inn med **Continue with GitHub**.
2. Velg **Add New → Project** og importer **Spiskammers**. Hvis repoet ikke vises, trykker du **Adjust GitHub App Permissions** og gir tilgang til Spiskammers.
3. Framework settes automatisk til **Vite**. Under **Environment Variables** legger du inn:
   - `VITE_SUPABASE_URL` = Project URL fra steg 2.7
   - `VITE_SUPABASE_ANON_KEY` = publishable-nøkkelen fra steg 2.7
4. Trykk **Deploy**. Etter et minutt får du en adresse, f.eks. `spiskammers.vercel.app`.

Hver gang ny kode legges i hovedgrenen (`main`), publiserer Vercel den automatisk.

## 4. iPad på kjøkkenet

1. Åpne Vercel-adressen i **Safari**.
2. Trykk **Del**-knappen og velg **Legg til på Hjem-skjerm**.
3. Åpne Spiskammers fra Hjem-skjermen og logg inn med husstandskontoen.
4. **Lås iPaden til appen:** gå til **Innstillinger → Tilgjengelighet → Veiledet tilgang** og slå det på, og velg en kode. Åpne appen og trykk tre ganger på sideknappen (eller Hjem-knappen) og velg **Start**.
5. **Hold skjermen på:** gå til **Innstillinger → Skjerm og lysstyrke → Autolås** og velg **Aldri** hvis iPaden står i lader.

Mobilene i familien gjør steg 1–3.

## Kostnad

Supabase og Vercel er gratis i denne størrelsen. Claude betales per bilde og ligger typisk på noen få øre per vare og litt mer per kvittering. Grensen fra steg 1.3 er taket.
