-- Spiskammers – vanlig kjøkkenvekt som måler hvor mye som er igjen.
-- Kjøres én gang i Supabase: SQL Editor → lim inn hele filen → Run.
--
-- Prinsipp: rest = (vekt − emballasje) / innhold.
--  * Innhold (netto) er pakningens mengde i g, eller i ml der 1 ml regnes som 1 g.
--  * Emballasjevekten læres per produkt når en full pakning veies (521 g − 500 g = 21 g), som et snitt over målinger.
--  * Standardbeholdere (f.eks. «Krydderglass») har én fast vekt som deles av mange produkter.
--  * En pakning kan ha eget innhold (innhold_g), f.eks. et krydderglass som er fylt opp fra pose.

create table if not exists beholder (
  id          uuid primary key default gen_random_uuid(),
  husstand_id uuid not null references husstand(id) on delete cascade,
  navn        text not null,
  vekt_g      numeric not null check (vekt_g > 0),
  opprettet   timestamptz not null default now()
);
create unique index if not exists beholder_navn on beholder(husstand_id, lower(navn));

alter table produkt add column if not exists emballasje_g numeric check (emballasje_g >= 0);
alter table produkt add column if not exists emballasje_n integer not null default 0;
alter table produkt add column if not exists beholder_id uuid references beholder(id) on delete set null;
alter table pakning add column if not exists innhold_g numeric check (innhold_g > 0);

alter table beholder enable row level security;
drop policy if exists beholder_egen on beholder;
create policy beholder_egen on beholder for all using (husstand_id = min_husstand()) with check (husstand_id = min_husstand());
grant select, insert, update, delete on beholder to authenticated;
revoke all on beholder from anon;

-- Lageret får emballasjevekt (tara) og innhold, så appen kan regne prosent fra vekt.
create or replace view lager with (security_invoker = true) as
  select p.id, p.sted, p.andel, p.holdbarhet, p.dato_type, p.apnet, p.registrert, p.pris,
         pr.id as produkt_id, pr.navn, pr.merke, pr.ean, pr.kategori, pr.pakning_mengde, pr.pakning_enhet,
         coalesce(b.vekt_g, pr.emballasje_g) as tara_g,
         coalesce(p.innhold_g, case when pr.pakning_enhet in ('g','ml') then pr.pakning_mengde end) as netto_g,
         b.navn as beholder
  from pakning p
  join produkt pr on pr.id = p.produkt_id
  left join beholder b on b.id = pr.beholder_id
  where p.status = 'aktiv';
grant select on lager to authenticated;

-- Ny eller eksisterende standardbeholder (samme navn = samme beholder).
create or replace function lagre_beholder(p_navn text, p_vekt_g numeric) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); bid uuid;
begin
  if h is null then raise exception 'Ingen husstand'; end if;
  if coalesce(trim(p_navn), '') = '' or coalesce(p_vekt_g, 0) <= 0 then raise exception 'Beholderen trenger navn og vekt'; end if;
  select id into bid from beholder where husstand_id = h and lower(navn) = lower(trim(p_navn));
  if bid is null then
    insert into beholder(husstand_id, navn, vekt_g) values (h, trim(p_navn), p_vekt_g) returning id into bid;
  else
    update beholder set vekt_g = p_vekt_g where id = bid;
  end if;
  return bid;
end $$;

-- Lær emballasjevekt fra en veiing ved innlegging, og sett riktig rest på pakningen.
--  p_andel:        hvor full pakningen er (1 = full, ellers anslag)
--  p_emballasje_g: kjent emballasjevekt (overstyrer beregning)
--  p_beholder:     standardbeholder (krydderglass o.l.)
-- Returnerer {tara_g, andel, innhold_g}.
create or replace function laer_emballasje(
  p_pakning uuid, p_vekt_g numeric, p_andel numeric default 1,
  p_emballasje_g numeric default null, p_beholder uuid default null
) returns json
language plpgsql security invoker set search_path = public as $$
declare
  h uuid := min_husstand();
  pk pakning%rowtype; pr produkt%rowtype;
  netto numeric; tara numeric; v_andel numeric; innhold numeric;
begin
  select * into pk from pakning where id = p_pakning and husstand_id = h;
  if pk.id is null then raise exception 'Fant ikke pakningen'; end if;
  select * into pr from produkt where id = pk.produkt_id;
  if coalesce(p_vekt_g, 0) <= 0 then raise exception 'Mangler vekt'; end if;
  netto := coalesce(pk.innhold_g, case when pr.pakning_enhet in ('g','ml') then pr.pakning_mengde end);
  v_andel := least(greatest(coalesce(p_andel, 1), 0.01), 1);

  if p_beholder is not null then
    -- Standardbeholder: kjent tara. Mangler innhold, er det som ligger i nå = andel av fullt glass.
    select vekt_g into tara from beholder where id = p_beholder and husstand_id = h;
    if tara is null then raise exception 'Fant ikke beholderen'; end if;
    update produkt set beholder_id = p_beholder where id = pr.id;
    if netto is null then
      innhold := greatest(p_vekt_g - tara, 0) / v_andel;
      if innhold > 0 then update pakning set innhold_g = innhold where id = pk.id; netto := innhold; end if;
    end if;
  elsif p_emballasje_g is not null then
    tara := p_emballasje_g;
    update produkt set
      emballasje_g = (coalesce(emballasje_g, 0) * emballasje_n + tara) / (emballasje_n + 1),
      emballasje_n = emballasje_n + 1
    where id = pr.id;
  else
    if netto is null then raise exception 'Kjenner ikke nettovekten – oppgi emballasjevekt i stedet'; end if;
    tara := p_vekt_g - netto * v_andel;
    if tara < 0 or tara > p_vekt_g * 0.9 then
      raise exception 'Vekten (% g) stemmer ikke med nettovekt % g og % %% fullt', round(p_vekt_g), round(netto), round(v_andel * 100);
    end if;
    update produkt set
      emballasje_g = (coalesce(emballasje_g, 0) * emballasje_n + tara) / (emballasje_n + 1),
      emballasje_n = emballasje_n + 1
    where id = pr.id;
  end if;

  -- Rest ut fra vekten når innholdet er kjent.
  if netto is not null and netto > 0 then
    v_andel := least(greatest((p_vekt_g - tara) / netto, 0), 1);
  end if;
  update pakning set andel = round(v_andel, 3) where id = pk.id;
  return json_build_object('tara_g', round(tara, 1), 'andel', round(v_andel, 3), 'innhold_g', netto);
end $$;

grant execute on function lagre_beholder(text, numeric), laer_emballasje(uuid, numeric, numeric, numeric, uuid) to authenticated;
