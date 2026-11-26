# Spiskammers

Familiens matlager-app: registrer mat inn (strekkode, foto, kvittering) og ut (foto med mengde), hold oversikt over holdbarhet og få smartere innkjøp og middagsforslag.

- Plattform: nettapp (PWA) for iPad på kjøkkenet og mobiler
- Database: Supabase
- Motor: serverfunksjon som kaller Claude-API
- Produktdata: Kassalapp

Kravspesifikasjon: https://claude.ai/artifact/4kbWiau5HiVdcxoW1XgG1j

## Oppsett

Se [docs/OPPSETT.md](docs/OPPSETT.md) for steg-for-steg-oppsett av Supabase, Anthropic og Vercel.

## Struktur

- `supabase/migrations/` – databaseskjema, tilgangsregler og funksjoner for inn, uttak, flytt og angre
- `supabase/functions/claude/` – serverfunksjonen som kaller Claude (vare, uttak, kvittering)
- `src/sider/` – skjermene: Ta ut, Legg inn (vare og kvittering), Lager, Mer
- `src/deler/` – felles deler, bl.a. bekreftelse av uttak med ett trykk
