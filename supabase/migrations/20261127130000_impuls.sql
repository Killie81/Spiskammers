-- Impulskjøp: varer fotografert i handlevogna som ikke sto på handlelisten.
-- Prisen fra kvitteringen lagres, så Mer kan vise hva impulskjøpene koster.
alter table kurv_vare add column if not exists impuls boolean not null default false;
alter table kurv_vare add column if not exists pris numeric;
update kurv_vare set impuls = true where handleliste_id is null;
