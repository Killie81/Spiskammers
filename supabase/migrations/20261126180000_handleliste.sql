-- Spiskammers – handleliste som lærer forbruket.
-- Kjøres én gang i Supabase: SQL Editor → lim inn hele filen → Run.
--
-- Prognosen i korte trekk:
--  * Forbruk måles i pakninger per uke fra uttak registrert som «brukt» (kastet teller ikke som behov).
--  * Unormale uker holdes utenfor for alle varer: uker der hele husstanden registrerte langt mer
--    (høytid, merkedager) eller langt mindre (reise, ferie) enn i en typisk uke, og uker dere har markert selv.
--  * Én enkelt ekstrem uke for én vare dempes også (maks 2 × varens typiske uke).
--  * Behovet dekker frem til neste handletur + 2 dager. Det som mangler, foreslås.
--  * Varer som ofte kastes, foreslås i mindre mengde. Faste varer kommer alltid med.

-- ---------- Tabeller ----------

alter table husstand add column if not exists handledag integer not null default 4 check (handledag between 1 and 7); -- 4 = torsdag
alter table husstand add column if not exists handletime integer not null default 14 check (handletime between 0 and 23);
alter table husstand add column if not exists liste_oppdatert timestamptz;

alter table produkt add column if not exists fast boolean not null default false;
alter table produkt add column if not exists fast_antall integer not null default 1 check (fast_antall > 0);

create table if not exists handleliste_vare (
  id            uuid primary key default gen_random_uuid(),
  husstand_id   uuid not null references husstand(id) on delete cascade,
  produkt_id    uuid references produkt(id) on delete set null,
  navn          text not null,
  antall        integer not null default 1 check (antall > 0),
  avdeling      text not null default 'annet',
  kilde         text not null default 'manuell' check (kilde in ('forslag','fast','manuell')),
  begrunnelse   text,
  avkrysset     boolean not null default false,
  avkrysset_tid timestamptz,
  status        text not null default 'aktiv' check (status in ('aktiv','kjopt','fjernet')),
  kontroll      text check (kontroll in ('ikke_pa_kvittering')),
  kvittering_id uuid references kvittering(id) on delete set null,
  opprettet     timestamptz not null default now()
);
create index if not exists handleliste_aktiv on handleliste_vare(husstand_id, status);

create table if not exists unormal_uke (
  husstand_id uuid not null references husstand(id) on delete cascade,
  uke         date not null,           -- mandagen i uka
  primary key (husstand_id, uke)
);

alter table handleliste_vare enable row level security;
alter table unormal_uke enable row level security;
drop policy if exists handleliste_egen on handleliste_vare;
create policy handleliste_egen on handleliste_vare for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
drop policy if exists unormal_egen on unormal_uke;
create policy unormal_egen on unormal_uke for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
grant select, insert, update, delete on handleliste_vare, unormal_uke to authenticated;
revoke all on handleliste_vare, unormal_uke from anon;

-- ---------- Prognose ----------

create or replace function beregn_forslag(p_h uuid)
returns table (produkt_id uuid, navn text, kategori text, beholdning numeric, per_dag numeric, antall integer, begrunnelse text)
language plpgsql stable security definer set search_path = public as $$
declare
  idag date := (now() at time zone 'Europe/Oslo')::date;
  denne_uke date := date_trunc('week', (now() at time zone 'Europe/Oslo'))::date;
  dag integer;
  horisont numeric;
begin
  select handledag into dag from husstand where id = p_h;
  -- Dager til neste handledag etter den kommende, pluss to dagers margin.
  horisont := ((coalesce(dag, 4) - extract(isodow from idag)::int + 7) % 7) + 7 + 2;

  return query
  with uker as (
    select (denne_uke - n * 7)::date as uke from generate_series(1, 12) n
  ),
  aktivitet as (
    select u.uke, count(h.id)::numeric as n
    from uker u
    left join hendelse h on h.husstand_id = p_h and h.type in ('forbruk','svinn')
      and date_trunc('week', h.tid at time zone 'Europe/Oslo')::date = u.uke
    group by u.uke
  ),
  typisk as (select percentile_cont(0.5) within group (order by n)::numeric as m from aktivitet where n > 0),
  normale as (
    select a.uke from aktivitet a, typisk t
    where t.m is not null and a.n >= 0.4 * t.m and a.n <= 1.8 * t.m
      and not exists (select 1 from unormal_uke x where x.husstand_id = p_h and x.uke = a.uke)
  ),
  bruk as (
    select pk.produkt_id as pid, date_trunc('week', h.tid at time zone 'Europe/Oslo')::date as uke,
      sum(case when h.type = 'forbruk' then greatest(coalesce(h.andel_for,0) - coalesce(h.andel_etter,0), 0) else 0 end) as brukt,
      sum(case when h.type = 'svinn'   then greatest(coalesce(h.andel_for,0) - coalesce(h.andel_etter,0), 0) else 0 end) as kastet
    from hendelse h join pakning pk on pk.id = h.pakning_id
    where h.husstand_id = p_h and h.type in ('forbruk','svinn') and h.tid >= (denne_uke - 84)
    group by 1, 2
  ),
  bruk_normal as (select b.* from bruk b join normale n on n.uke = b.uke),
  typisk_vare as (
    select pid, percentile_cont(0.5) within group (order by brukt)::numeric as m from bruk_normal where brukt > 0 group by pid
  ),
  rate as (
    select bn.pid, sum(least(bn.brukt, 2 * tv.m)) as s
    from bruk_normal bn join typisk_vare tv on tv.pid = bn.pid group by bn.pid
  ),
  vare as (
    select pr.id as pid, pr.navn as vnavn, pr.kategori as vkat,
      (select count(*) from normale n where n.uke >= date_trunc('week', pr.opprettet at time zone 'Europe/Oslo')::date) as n_uker,
      coalesce(r.s, 0) as rate_s,
      (select coalesce(sum(b.brukt), 0) from bruk b where b.pid = pr.id) as brukt_alle,
      (select coalesce(sum(b.kastet), 0) from bruk b where b.pid = pr.id) as kastet_alle,
      (select coalesce(sum(pk.andel), 0) from pakning pk where pk.produkt_id = pr.id and pk.status = 'aktiv') as beh
    from produkt pr left join rate r on r.pid = pr.id
    where pr.husstand_id = p_h
  ),
  beregnet as (
    select v.*,
      case when v.n_uker >= 3 and v.rate_s > 0 then v.rate_s / (v.n_uker * 7.0) end as pd,
      case when v.brukt_alle + v.kastet_alle > 0 then v.kastet_alle / (v.brukt_alle + v.kastet_alle) else 0 end as svinn
    from vare v
  ),
  forslag as (
    select b.*,
      case
        when b.pd is not null and b.pd * horisont - b.beh > 0.15 then
          greatest(1, case when b.svinn > 0.3 then floor(b.pd * horisont - b.beh) else ceil(b.pd * horisont - b.beh) end)::int
        when b.pd is null and b.brukt_alle > 0 and b.beh < 0.25 then 1
      end as ant
    from beregnet b
  )
  select f.pid, f.vnavn, f.vkat, round(f.beh, 2), round(f.pd, 3), f.ant,
    case
      when f.pd is not null then
        'Bruker ca. ' || trim(to_char(round(f.pd * 7, 1), 'FM990D0')) || ' pk/uke, nok til ' ||
        greatest(0, floor(f.beh / f.pd))::int || ' d'
      else 'Snart tom'
    end || case when f.svinn > 0.3 then ' · ofte kastet, foreslår mindre' else '' end
  from forslag f where f.ant is not null;
end $$;

-- Lag torsdagslisten: fjern gamle, ikke avkryssede forslag og legg inn nye forslag og faste varer.
create or replace function oppdater_handleliste(p_h uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; m integer;
begin
  delete from handleliste_vare
  where husstand_id = p_h and status = 'aktiv' and kilde in ('forslag','fast') and not avkrysset;

  insert into handleliste_vare(husstand_id, produkt_id, navn, antall, avdeling, kilde, begrunnelse)
  select p_h, pr.id, pr.navn, pr.fast_antall, coalesce(pr.kategori, 'annet'), 'fast', 'Fast vare'
  from produkt pr
  where pr.husstand_id = p_h and pr.fast
    and not exists (select 1 from handleliste_vare v where v.husstand_id = p_h and v.status = 'aktiv'
                    and (v.produkt_id = pr.id or lower(v.navn) = lower(pr.navn)));
  get diagnostics m = row_count; n := n + m;

  insert into handleliste_vare(husstand_id, produkt_id, navn, antall, avdeling, kilde, begrunnelse)
  select p_h, f.produkt_id, f.navn, f.antall, coalesce(f.kategori, 'annet'), 'forslag', f.begrunnelse
  from beregn_forslag(p_h) f
  where not exists (select 1 from handleliste_vare v where v.husstand_id = p_h and v.status = 'aktiv'
                    and (v.produkt_id = f.produkt_id or lower(v.navn) = lower(f.navn)));
  get diagnostics m = row_count; n := n + m;

  update husstand set liste_oppdatert = now() where id = p_h;
  return n;
end $$;

-- Kalles hver hele time; oppdaterer de husstandene som har handledag og -time akkurat nå (norsk tid).
create or replace function oppdater_alle_handlelister() returns integer
language plpgsql security definer set search_path = public as $$
declare h record; n integer := 0;
begin
  for h in
    select id from husstand
    where handledag = extract(isodow from now() at time zone 'Europe/Oslo')
      and handletime = extract(hour from now() at time zone 'Europe/Oslo')
  loop
    perform oppdater_handleliste(h.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Knappen «Oppdater forslag nå» i appen.
create or replace function oppdater_min_handleliste() returns integer
language plpgsql security definer set search_path = public as $$
declare h uuid := min_husstand();
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  return oppdater_handleliste(h);
end $$;

-- Legg til vare manuelt. Kobles til kjent produkt hvis navnet finnes; finnes den allerede på listen, økes antallet.
create or replace function legg_til_handleliste(p_navn text, p_antall integer default 1, p_avdeling text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid; kat text; vid uuid;
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  if coalesce(trim(p_navn), '') = '' then raise exception 'Varen trenger et navn'; end if;
  select id, kategori into pid, kat from produkt where husstand_id = h and lower(navn) = lower(trim(p_navn)) limit 1;
  select id into vid from handleliste_vare
    where husstand_id = h and status = 'aktiv' and (produkt_id = pid or lower(navn) = lower(trim(p_navn))) limit 1;
  if vid is not null then
    update handleliste_vare set antall = antall + greatest(coalesce(p_antall,1),1) where id = vid;
    return vid;
  end if;
  insert into handleliste_vare(husstand_id, produkt_id, navn, antall, avdeling, kilde)
  values (h, pid, trim(p_navn), greatest(coalesce(p_antall,1),1), coalesce(kat, p_avdeling, 'annet'), 'manuell')
  returning id into vid;
  return vid;
end $$;

-- Gjør en vare fast (alltid på listen) eller ikke. Lager produktet hvis det ikke finnes.
create or replace function sett_fast(p_vare uuid, p_fast boolean) returns void
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); v handleliste_vare%rowtype; pid uuid;
begin
  select * into v from handleliste_vare where id = p_vare and husstand_id = h;
  if v.id is null then raise exception 'Fant ikke varen'; end if;
  pid := coalesce(v.produkt_id, finn_eller_lag_produkt(v.navn, null, null, v.avdeling, null, null, null));
  update produkt set fast = p_fast, fast_antall = greatest(v.antall, 1) where id = pid;
  update handleliste_vare set produkt_id = pid, kilde = case when p_fast then 'fast' else 'manuell' end,
    begrunnelse = case when p_fast then 'Fast vare' else begrunnelse end where id = v.id;
end $$;

-- Etter handleturen: avstem listen mot kvitteringen.
-- Varer på kvitteringen markeres som kjøpt. Avkryssede varer som ikke finnes på kvitteringen flagges.
create or replace function avstem_handleliste(p_kvittering uuid) returns json
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); kjopt integer; flagget integer;
begin
  update handleliste_vare v set status = 'kjopt', kvittering_id = p_kvittering, kontroll = null
  where v.husstand_id = h and v.status = 'aktiv'
    and exists (
      select 1 from pakning pk join produkt pr on pr.id = pk.produkt_id
      where pk.kvittering_id = p_kvittering
        and (pk.produkt_id = v.produkt_id
             or lower(pr.navn) like '%' || lower(v.navn) || '%'
             or lower(v.navn) like '%' || lower(pr.navn) || '%'));
  get diagnostics kjopt = row_count;

  update handleliste_vare set kontroll = 'ikke_pa_kvittering'
  where husstand_id = h and status = 'aktiv' and avkrysset;
  get diagnostics flagget = row_count;

  return json_build_object('kjopt', kjopt, 'flagget', flagget);
end $$;

revoke execute on function beregn_forslag(uuid), oppdater_handleliste(uuid), oppdater_alle_handlelister() from public, anon, authenticated;
grant execute on function oppdater_min_handleliste(), legg_til_handleliste(text, integer, text), sett_fast(uuid, boolean),
  avstem_handleliste(uuid) to authenticated;

-- ---------- Torsdag kl. 14 ----------
-- pg_cron kjører hver hele time; funksjonen over sjekker selv norsk tid, så sommer- og vintertid blir riktig.
create extension if not exists pg_cron;
select cron.schedule('spiskammers-handleliste', '0 * * * *', $cron$select public.oppdater_alle_handlelister()$cron$);
