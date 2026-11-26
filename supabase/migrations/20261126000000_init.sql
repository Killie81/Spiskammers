-- Spiskammers – databaseskjema (fase 1)
-- Kjøres én gang i Supabase: SQL Editor → lim inn hele filen → Run.
-- Alt som skjer med en pakning lagres som hendelse; pakning.andel er gjeldende rest (1 = full, 0 = tom).

create extension if not exists pgcrypto;

-- ---------- Tabeller ----------

create table husstand (
  id          uuid primary key default gen_random_uuid(),
  navn        text not null default 'Hjemme',
  glass_ml    integer not null default 300 check (glass_ml > 0),
  opprettet   timestamptz not null default now()
);

create table medlem (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  husstand_id uuid not null references husstand(id) on delete cascade
);

create table produkt (
  id             uuid primary key default gen_random_uuid(),
  husstand_id    uuid not null references husstand(id) on delete cascade,
  navn           text not null,
  merke          text,
  ean            text,
  kategori       text,
  pakning_mengde numeric,
  pakning_enhet  text check (pakning_enhet in ('ml','g','stk')),
  standard_sted  text check (standard_sted in ('fryser','kjoleskap','bod','skap','skuffe')),
  opprettet      timestamptz not null default now()
);
create unique index produkt_ean_unik on produkt(husstand_id, ean) where ean is not null;
create index produkt_navn on produkt(husstand_id, lower(navn));

create table kvittering (
  id          uuid primary key default gen_random_uuid(),
  husstand_id uuid not null references husstand(id) on delete cascade,
  butikk      text,
  dato        date,
  total       numeric,
  bilde_sti   text,
  tolkning    jsonb,
  registrert  timestamptz not null default now()
);

create table pakning (
  id           uuid primary key default gen_random_uuid(),
  husstand_id  uuid not null references husstand(id) on delete cascade,
  produkt_id   uuid not null references produkt(id) on delete cascade,
  sted         text not null check (sted in ('fryser','kjoleskap','bod','skap','skuffe')),
  andel        numeric not null default 1 check (andel >= 0 and andel <= 1),
  holdbarhet   date,
  dato_type    text check (dato_type in ('best_for','siste_forbruksdag','anslag')),
  apnet        date,
  pris         numeric,
  kvittering_id uuid references kvittering(id) on delete set null,
  status       text not null default 'aktiv' check (status in ('aktiv','tom','kastet')),
  registrert   timestamptz not null default now()
);
create index pakning_aktiv on pakning(husstand_id, status, holdbarhet);

create table hendelse (
  id          uuid primary key default gen_random_uuid(),
  husstand_id uuid not null references husstand(id) on delete cascade,
  pakning_id  uuid not null references pakning(id) on delete cascade,
  type        text not null check (type in ('inn','forbruk','svinn','flytt','korrigering')),
  andel_for   numeric,
  andel_etter numeric,
  sted_for    text,
  sted_etter  text,
  metode      text check (metode in ('foto','strekkode','kvittering','manuelt')),
  bilde_sti   text,
  tid         timestamptz not null default now()
);
create index hendelse_tid on hendelse(husstand_id, tid desc);

create table utgift (
  id            uuid primary key default gen_random_uuid(),
  husstand_id   uuid not null references husstand(id) on delete cascade,
  kvittering_id uuid references kvittering(id) on delete cascade,
  type          text not null check (type in ('pose','pant')),
  tekst         text,
  antall        integer not null default 1,
  belop         numeric not null,
  dato          date not null default current_date
);

-- ---------- Tilgang: alle ser bare sin egen husstand ----------

create or replace function min_husstand() returns uuid
language sql stable security definer set search_path = public as $$
  select husstand_id from medlem where user_id = auth.uid()
$$;

alter table husstand   enable row level security;
alter table medlem     enable row level security;
alter table produkt    enable row level security;
alter table kvittering enable row level security;
alter table pakning    enable row level security;
alter table hendelse   enable row level security;
alter table utgift     enable row level security;

create policy husstand_egen on husstand for all using (id = min_husstand()) with check (id = min_husstand());
create policy medlem_egen   on medlem   for select using (user_id = auth.uid());
create policy produkt_egen    on produkt    for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
create policy kvittering_egen on kvittering for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
create policy pakning_egen    on pakning    for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
create policy hendelse_egen   on hendelse   for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
create policy utgift_egen     on utgift     for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());

-- ---------- Funksjoner appen kaller ----------

-- Første innlogging: lag husstand og koble brukeren til den.
create or replace function opprett_husstand(p_navn text default 'Hjemme') returns uuid
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'Ikke innlogget'; end if;
  select husstand_id into h from medlem where user_id = auth.uid();
  if h is not null then return h; end if;
  insert into husstand(navn) values (coalesce(nullif(p_navn,''),'Hjemme')) returning id into h;
  insert into medlem(user_id, husstand_id) values (auth.uid(), h);
  return h;
end $$;

-- Finn eller lag produkt (på EAN hvis den finnes, ellers på navn).
create or replace function finn_eller_lag_produkt(
  p_navn text, p_merke text, p_ean text, p_kategori text,
  p_mengde numeric, p_enhet text, p_sted text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid;
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  if nullif(p_ean,'') is not null then
    select id into pid from produkt where husstand_id = h and ean = p_ean;
  end if;
  if pid is null then
    select id into pid from produkt
      where husstand_id = h and lower(navn) = lower(p_navn) and (ean is null or nullif(p_ean,'') is null)
      limit 1;
  end if;
  if pid is null then
    insert into produkt(husstand_id, navn, merke, ean, kategori, pakning_mengde, pakning_enhet, standard_sted)
    values (h, p_navn, p_merke, nullif(p_ean,''), p_kategori, p_mengde,
            case when p_enhet in ('ml','g','stk') then p_enhet end,
            case when p_sted in ('fryser','kjoleskap','bod','skap','skuffe') then p_sted end)
    returning id into pid;
  else
    update produkt set
      merke = coalesce(merke, p_merke),
      kategori = coalesce(kategori, p_kategori),
      pakning_mengde = coalesce(pakning_mengde, p_mengde),
      pakning_enhet = coalesce(pakning_enhet, case when p_enhet in ('ml','g','stk') then p_enhet end),
      standard_sted = coalesce(case when p_sted in ('fryser','kjoleskap','bod','skap','skuffe') then p_sted end, standard_sted)
    where id = pid;
  end if;
  return pid;
end $$;

-- Registrer inn: n like pakninger av samme vare.
create or replace function registrer_inn(
  p_navn text, p_merke text, p_ean text, p_kategori text,
  p_mengde numeric, p_enhet text, p_sted text,
  p_antall integer, p_andel numeric, p_holdbarhet date, p_dato_type text,
  p_pris numeric, p_kvittering uuid, p_metode text, p_bilde text
) returns setof uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid; pk uuid; i integer;
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  pid := finn_eller_lag_produkt(p_navn, p_merke, p_ean, p_kategori, p_mengde, p_enhet, p_sted);
  for i in 1..greatest(coalesce(p_antall,1),1) loop
    insert into pakning(husstand_id, produkt_id, sted, andel, holdbarhet, dato_type, pris, kvittering_id, apnet)
    values (h, pid, p_sted, least(greatest(coalesce(p_andel,1),0),1), p_holdbarhet, p_dato_type,
            case when p_pris is not null then p_pris / greatest(coalesce(p_antall,1),1) end,
            p_kvittering, case when coalesce(p_andel,1) < 1 then current_date end)
    returning id into pk;
    insert into hendelse(husstand_id, pakning_id, type, andel_for, andel_etter, sted_etter, metode, bilde_sti)
    values (h, pk, 'inn', 0, least(greatest(coalesce(p_andel,1),0),1), p_sted, p_metode, p_bilde);
    return next pk;
  end loop;
end $$;

-- Uttak: sett ny rest. p_type = 'forbruk' eller 'svinn' (kastet). Returnerer hendelsens id (for angre).
create or replace function registrer_uttak(
  p_pakning uuid, p_ny_andel numeric, p_type text, p_metode text, p_bilde text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); gammel numeric; ny numeric; hid uuid;
begin
  if p_type not in ('forbruk','svinn') then raise exception 'Ugyldig type'; end if;
  select andel into gammel from pakning where id = p_pakning and husstand_id = h for update;
  if gammel is null then raise exception 'Fant ikke pakningen'; end if;
  ny := case when p_type = 'svinn' then 0 else least(greatest(p_ny_andel,0), gammel) end;
  update pakning set
    andel = ny,
    apnet = coalesce(apnet, current_date),
    status = case when p_type = 'svinn' then 'kastet' when ny = 0 then 'tom' else 'aktiv' end
  where id = p_pakning;
  insert into hendelse(husstand_id, pakning_id, type, andel_for, andel_etter, metode, bilde_sti)
  values (h, p_pakning, p_type, gammel, ny, p_metode, p_bilde)
  returning id into hid;
  return hid;
end $$;

-- Flytt pakning mellom lagringssteder.
create or replace function flytt_pakning(p_pakning uuid, p_sted text) returns void
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); gammelt text; a numeric;
begin
  select sted, andel into gammelt, a from pakning where id = p_pakning and husstand_id = h for update;
  if gammelt is null then raise exception 'Fant ikke pakningen'; end if;
  update pakning set sted = p_sted where id = p_pakning;
  insert into hendelse(husstand_id, pakning_id, type, andel_for, andel_etter, sted_for, sted_etter, metode)
  values (h, p_pakning, 'flytt', a, a, gammelt, p_sted, 'manuelt');
end $$;

-- Angre siste uttak.
create or replace function angre_hendelse(p_hendelse uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); e hendelse%rowtype;
begin
  select * into e from hendelse where id = p_hendelse and husstand_id = h;
  if e.id is null then raise exception 'Fant ikke hendelsen'; end if;
  if e.type in ('forbruk','svinn','korrigering') then
    update pakning set andel = e.andel_for, status = 'aktiv' where id = e.pakning_id;
  elsif e.type = 'flytt' then
    update pakning set sted = e.sted_for where id = e.pakning_id;
  elsif e.type = 'inn' then
    delete from pakning where id = e.pakning_id;
    return;
  end if;
  delete from hendelse where id = e.id;
end $$;

grant execute on function min_husstand, opprett_husstand, finn_eller_lag_produkt, registrer_inn,
  registrer_uttak, flytt_pakning, angre_hendelse to authenticated;

-- Lagerliste som appen leser.
create or replace view lager with (security_invoker = true) as
  select p.id, p.sted, p.andel, p.holdbarhet, p.dato_type, p.apnet, p.registrert, p.pris,
         pr.id as produkt_id, pr.navn, pr.merke, pr.ean, pr.kategori, pr.pakning_mengde, pr.pakning_enhet
  from pakning p join produkt pr on pr.id = p.produkt_id
  where p.status = 'aktiv';

-- ---------- Bildelager ----------

insert into storage.buckets (id, name, public) values ('bilder', 'bilder', false)
on conflict (id) do nothing;

create policy bilder_les on storage.objects for select to authenticated
  using (bucket_id = 'bilder' and (storage.foldername(name))[1] = min_husstand()::text);
create policy bilder_skriv on storage.objects for insert to authenticated
  with check (bucket_id = 'bilder' and (storage.foldername(name))[1] = min_husstand()::text);
