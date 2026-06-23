-- PART 1 schema fixes
ALTER TABLE public.restaurants DROP CONSTRAINT IF EXISTS restaurants_name_key;
DROP INDEX IF EXISTS public.restaurants_zomato_id_key;
ALTER TABLE public.restaurants ADD CONSTRAINT restaurants_zomato_id_key UNIQUE (zomato_id);

ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS non_refunded_complaints NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaints_poor_packaging NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaints_poor_quality NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaints_wrong_order NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complaints_missing_items NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_logs_other_ors NUMERIC DEFAULT 0;

-- PART 2 security fixes
DROP POLICY IF EXISTS "profiles_select_auth" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "user_roles_select_auth" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;

DROP POLICY IF EXISTS "audit_insert_auth" ON public.audit_logs;
ALTER TABLE public.audit_logs ALTER COLUMN user_id SET NOT NULL;
CREATE POLICY "audit_insert_own" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_insert_auth" ON public.reports;
CREATE POLICY "reports_insert_admin" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
