import { supabase } from 'lib/supabase';

export type CustomerRow = { id: string; name: string; phone: string | null };

export async function fetchCustomers(): Promise<CustomerRow[]> {
  const { data, error } = await supabase.from('customers').select('id, name, phone').is('deleted_at', null).order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createCustomer(name: string, phone: string | null): Promise<string> {
  const { data, error } = await supabase.from('customers').insert({ name, phone }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateCustomer(id: string, name: string, phone: string | null): Promise<void> {
  const { error } = await supabase.from('customers').update({ name, phone }).eq('id', id);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
