import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const konfigurert = Boolean(url && key);
export const supabase = konfigurert
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

// Kast feilen videre med en lesbar melding.
export async function rpc(navn, args) {
  const { data, error } = await supabase.rpc(navn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function hentLager() {
  const { data, error } = await supabase.from('lager').select('*').order('holdbarhet', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

// Kall serverfunksjonen som snakker med Claude.
export async function spørClaude(body) {
  const { data, error } = await supabase.functions.invoke('claude', { body });
  if (error) {
    let melding = error.message;
    try { const j = await error.context.json(); if (j?.feil) melding = j.feil; } catch { /* behold melding */ }
    throw new Error(melding);
  }
  if (data?.feil) throw new Error(data.feil);
  return data.resultat;
}

export async function lastOppBilde(husstand, blob, mappe) {
  if (!blob) return null;
  const sti = `${husstand}/${mappe}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('bilder').upload(sti, blob, { contentType: 'image/jpeg' });
  return error ? null : sti;
}
