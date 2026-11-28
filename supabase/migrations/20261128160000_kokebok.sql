-- Kokebok: oppskrifter, favoritter og varer fra oppskrifter på handlelisten.

create table if not exists oppskrift (
  id                uuid primary key default gen_random_uuid(),
  husstand_id       uuid not null references husstand(id) on delete cascade,
  navn              text not null,
  beskrivelse       text,
  porsjoner         integer not null default 4 check (porsjoner > 0),
  tid_min           integer,
  kategori          text,
  -- [{ "navn": "kjøttdeig", "mengde": 400, "enhet": "g", "basis": false }]
  ingredienser      jsonb not null default '[]',
  -- ["Brun kjøttdeigen …", "…"]
  fremgangsmate     jsonb not null default '[]',
  kilde             text,
  bilde_sti         text,
  favoritt          boolean not null default false,
  notat             text,
  antall_laget      integer not null default 0,
  sist_laget        date,
  opprettet         timestamptz not null default now()
);
create index if not exists oppskrift_husstand on oppskrift(husstand_id, favoritt);

alter table oppskrift enable row level security;
drop policy if exists oppskrift_egen on oppskrift;
create policy oppskrift_egen on oppskrift for all
  using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
grant select, insert, update, delete on oppskrift to authenticated;

-- Handlelisten får en egen kilde for varer som mangler til en oppskrift.
alter table handleliste_vare drop constraint if exists handleliste_vare_kilde_check;
alter table handleliste_vare add constraint handleliste_vare_kilde_check
  check (kilde in ('forslag','fast','manuell','oppskrift'));

-- Legg en ingrediens på handlelisten. Står varen der fra før, økes ikke antallet;
-- bare oppskriften nevnes i begrunnelsen.
create or replace function legg_til_fra_oppskrift(p_navn text, p_oppskrift text, p_avdeling text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid; kat text; vid uuid; begr text;
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  if coalesce(trim(p_navn), '') = '' then raise exception 'Varen trenger et navn'; end if;
  select id, kategori into pid, kat from produkt where husstand_id = h and lower(navn) = lower(trim(p_navn)) limit 1;
  select id, begrunnelse into vid, begr from handleliste_vare
    where husstand_id = h and status = 'aktiv' and (produkt_id = pid or lower(navn) = lower(trim(p_navn))) limit 1;
  if vid is not null then
    if coalesce(begr, '') not ilike '%' || p_oppskrift || '%' then
      update handleliste_vare set begrunnelse = concat_ws(' · ', nullif(begr, ''), 'Til ' || p_oppskrift) where id = vid;
    end if;
    return vid;
  end if;
  insert into handleliste_vare(husstand_id, produkt_id, navn, antall, avdeling, kilde, begrunnelse)
  values (h, pid, trim(p_navn), 1, coalesce(kat, p_avdeling, 'annet'), 'oppskrift', 'Til ' || p_oppskrift)
  returning id into vid;
  return vid;
end $$;

grant execute on function legg_til_fra_oppskrift(text, text, text) to authenticated;
