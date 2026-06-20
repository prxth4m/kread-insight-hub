import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Action = Database["public"]["Enums"]["audit_action"];

export async function logAudit(action: Action, targetType: string, targetId: string | null, metadata?: Record<string, unknown>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("audit_logs").insert({
    user_id: u.user.id,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata: metadata ?? null,
  });
}