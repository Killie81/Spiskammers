-- Handlekurv: varer fotografert i butikken. De venter her til kvitteringen er scannet
-- (eller de legges i lager uten kvittering), og vises ikke i lageret før det.

create table if not exists kurv_vare (
  id              uuid primary key default gen_random_uuid(),
  husstand_id     uuid not null references husstand(id) on delete cascade,
  handleliste_id  uuid references handleliste_vare(id) on delete set null,
  navn            text not null,
  merke           text,
  ean             text,
  kategori        text,
  pakning_mengde  numeric,
  pakning_enhet   text,
  holdbarhet      date,
  dato_type       text,
  lagringssted    text,
  antall          integer not null default 1 check (antall > 0),
  stykkvis        boolean not null default false,
  bilde_sti       text,
  status          text not null default 'i_kurv' check (status in ('i_kurv','lagret','ikke_kjopt')),
  kvittering_id   uuid references kvittering(id) on delete set null,
  opprettet       timestamptz not null default now()
);
create index if not exists kurv_aktiv on kurv_vare(husstand_id, status);

alter table kurv_vare enable row level security;
drop policy if exists kurv_egen on kurv_vare;
create policy kurv_egen on kurv_vare for all
  using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
grant select, insert, update, delete on kurv_vare to authenticated;

-- Avslutt en kurvvare: 'lagret' (ligger nå i lageret) eller 'ikke_kjopt'.
-- Handlelisten følger med: lagret → kjøpt, ikke kjøpt → tilbake på listen.
create or replace function avslutt_kurv(p_kurv uuid, p_status text, p_kvittering uuid default null) returns void
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); hl uuid;
begin
  if p_status not in ('lagret','ikke_kjopt') then raise exception 'Ugyldig status'; end if;
  update kurv_vare set status = p_status, kvittering_id = p_kvittering
  where id = p_kurv and husstand_id = h
  returning handleliste_id into hl;
  if hl is null then return; end if;
  if p_status = 'lagret' then
    update handleliste_vare set status = 'kjopt', kontroll = null, kvittering_id = coalesce(p_kvittering, kvittering_id)
    where id = hl and husstand_id = h and status = 'aktiv';
  else
    update handleliste_vare set avkrysset = false, avkrysset_tid = null, kontroll = null
    where id = hl and husstand_id = h and status = 'aktiv';
  end if;
end $$;

grant execute on function avslutt_kurv(uuid, text, uuid) to authenticated;
