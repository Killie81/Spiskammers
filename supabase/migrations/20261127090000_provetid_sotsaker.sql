-- Prøvetid: fjerne varer uten at det teller som forbruk eller svinn,
-- og nullstille statistikken når appen tas i bruk for alvor.
-- Søtsaker: hvem som åpnet pakken.

alter table pakning drop constraint if exists pakning_status_check;
alter table pakning add constraint pakning_status_check check (status in ('aktiv','tom','kastet','fjernet'));
alter table pakning add column if not exists apnet_av text;
alter table husstand add column if not exists personer text[] not null default '{}';

-- Uttak: 'korrigering' fjerner pakningen uten å påvirke statistikken.
create or replace function registrer_uttak(
  p_pakning uuid, p_ny_andel numeric, p_type text, p_metode text, p_bilde text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); gammel numeric; ny numeric; hid uuid;
begin
  if p_type not in ('forbruk','svinn','korrigering') then raise exception 'Ugyldig type'; end if;
  select andel into gammel from pakning where id = p_pakning and husstand_id = h for update;
  if gammel is null then raise exception 'Fant ikke pakningen'; end if;
  ny := case when p_type in ('svinn','korrigering') then 0 else least(greatest(p_ny_andel,0), gammel) end;
  update pakning set
    andel = ny,
    apnet = case when p_type = 'korrigering' then apnet else coalesce(apnet, current_date) end,
    status = case when p_type = 'svinn' then 'kastet' when p_type = 'korrigering' then 'fjernet'
                  when ny = 0 then 'tom' else 'aktiv' end
  where id = p_pakning;
  insert into hendelse(husstand_id, pakning_id, type, andel_for, andel_etter, metode, bilde_sti)
  values (h, p_pakning, p_type, gammel, ny, p_metode, p_bilde)
  returning id into hid;
  return hid;
end $$;

-- Fjern en eller flere pakninger som feilregistrering. Returnerer hendelsene (for angre).
create or replace function fjern_pakninger(p_ider uuid[]) returns uuid[]
language plpgsql security invoker set search_path = public as $$
declare i uuid; ider uuid[] := '{}';
begin
  foreach i in array p_ider loop
    ider := ider || registrer_uttak(i, 0, 'korrigering', 'manuelt', null);
  end loop;
  return ider;
end $$;

-- Start statistikken på nytt: alt forbruk og svinn til nå regnes som prøving.
create or replace function nullstill_statistikk() returns integer
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); n integer;
begin
  update hendelse set type = 'korrigering'
  where husstand_id = h and type in ('forbruk','svinn');
  get diagnostics n = row_count;
  delete from handleliste_vare where husstand_id = h and kilde = 'forslag' and status = 'aktiv' and not avkrysset;
  return n;
end $$;

-- Hvem åpnet pakken (brukes for søtsaker).
create or replace function sett_apnet_av(p_pakning uuid, p_navn text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update pakning set apnet_av = nullif(trim(p_navn), '')
  where id = p_pakning and husstand_id = min_husstand();
end $$;

-- Søtsaker som egen type.
update produkt set kategori = 'sotsaker'
where lower(navn) ~ '(sjokolade|godteri|smågodt|godis|chips|potetgull|lakris|seigmenn|snacks|twist|kvikk lunsj|non ?stop|smash|m&m|nøttemiks|popcorn)';

create or replace view lager with (security_invoker = true) as
  select p.id, p.sted, p.andel, p.holdbarhet, p.dato_type, p.apnet, p.registrert, p.pris,
         pr.id as produkt_id, pr.navn, pr.merke, pr.ean, pr.kategori, pr.pakning_mengde, pr.pakning_enhet,
         coalesce(b.vekt_g, pr.emballasje_g) as tara_g,
         coalesce(p.innhold_g, case when pr.pakning_enhet in ('g','ml') then pr.pakning_mengde end) as netto_g,
         b.navn as beholder,
         pr.stykkvis,
         p.apnet_av
  from pakning p
  join produkt pr on pr.id = p.produkt_id
  left join beholder b on b.id = pr.beholder_id
  where p.status = 'aktiv';
grant select on lager to authenticated;

grant execute on function fjern_pakninger(uuid[]), nullstill_statistikk(), sett_apnet_av(uuid, text) to authenticated;
