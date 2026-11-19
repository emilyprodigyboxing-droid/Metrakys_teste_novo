
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(
  SUPABASE_URL.trim(),
  SUPABASE_ANON_KEY.trim(),
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);

// Cliente temporário para autenticações de confirmação,
// sem substituir a sessão do funcionário que está a trabalhar.
export function createTemporaryClient() {
  return createClient(
    SUPABASE_URL.trim(),
    SUPABASE_ANON_KEY.trim(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

// Procurar o perfil do funcionário autenticado.
export async function getEmployeeProfile(userId) {
  const { data, error } = await supabase
    .from("employee_profiles")
    .select("id, fullname, role, signature_path, active")
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;

  return data;
}

// Listar funcionários ativos.
export async function getActiveEmployees() {
  const { data, error } = await supabase
    .from("employee_profiles")
    .select("id, fullname, role, signature_path, active")
    .eq("active", true)
    .order("fullname");

  if (error) throw error;

  return data || [];
}

// Obter URL temporário para visualizar uma assinatura privada.
export async function getSignatureUrl(path) {
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from("employee-signatures")
    .createSignedUrl(path, 3600);

  if (error) throw error;

  return data.signedUrl;
}
