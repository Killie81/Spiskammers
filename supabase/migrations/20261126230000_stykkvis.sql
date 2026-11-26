-- Stykkvarer: frukt o.l. som tas ut én og én (bananer, appelsiner, klementiner …).
-- Hvert stykk er en egen pakning, så uttak teller stykk i stedet for prosent.

alter table produkt add column if not exists stykkvis boolean not null default false;

-- Kjente stykkvarer som allerede ligger i databasen.
update produkt set stykkvis = true
where lower(navn) ~ '(banan|appelsin|klementin|mandarin|eple|epler|pære|kiwi|avokado|nektarin|fersken|plomme|sitron|lime|mango|grapefrukt|granateple)';

create or replace view lager with (security_invoker = true) as
  select p.id, p.sted, p.andel, p.holdbarhet, p.dato_type, p.apnet, p.registrert, p.pris,
         pr.id as produkt_id, pr.navn, pr.merke, pr.ean, pr.kategori, pr.pakning_mengde, pr.pakning_enhet,
         coalesce(b.vekt_g, pr.emballasje_g) as tara_g,
         coalesce(p.innhold_g, case when pr.pakning_enhet in ('g','ml') then pr.pakning_mengde end) as netto_g,
         b.navn as beholder,
         pr.stykkvis
  from pakning p
  join produkt pr on pr.id = p.produkt_id
  left join beholder b on b.id = pr.beholder_id
  where p.status = 'aktiv';
grant select on lager to authenticated;

-- Marker produktet til en pakning som stykkvare (eller ikke).
create or replace function sett_stykkvis(p_pakning uuid, p_verdi boolean) returns void
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid;
begin
  select produkt_id into pid from pakning where id = p_pakning and husstand_id = h;
  if pid is null then raise exception 'Fant ikke pakningen'; end if;
  update produkt set stykkvis = p_verdi, pakning_mengde = case when p_verdi then 1 else pakning_mengde end,
         pakning_enhet = case when p_verdi then 'stk' else pakning_enhet end
  where id = pid;
end $$;

-- Ta ut et antall stykk av samme vare på samme sted. Den valgte pakningen tas først,
-- deretter den som går ut først. Returnerer hendelsene, så hele uttaket kan angres.
create or replace function ta_ut_stk(
  p_pakning uuid, p_antall int, p_type text, p_metode text, p_bilde text
) returns uuid[]
language plpgsql security invoker set search_path = public as $$
declare h uuid := min_husstand(); pid uuid; st text; r record; ider uuid[] := '{}';
begin
  select produkt_id, sted into pid, st from pakning where id = p_pakning and husstand_id = h;
  if pid is null then raise exception 'Fant ikke pakningen'; end if;
  for r in
    select id from pakning
    where husstand_id = h and produkt_id = pid and sted = st and status = 'aktiv'
    order by (id = p_pakning) desc, holdbarhet nulls last, registrert
    limit greatest(coalesce(p_antall, 1), 1)
  loop
    ider := ider || registrer_uttak(r.id, 0, p_type, p_metode, p_bilde);
  end loop;
  return ider;
end $$;

grant execute on function sett_stykkvis(uuid, boolean), ta_ut_stk(uuid, int, text, text, text) to authenticated;
