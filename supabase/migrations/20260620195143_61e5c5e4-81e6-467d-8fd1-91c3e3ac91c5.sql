
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');
CREATE TYPE public.platform_type AS ENUM ('zomato', 'swiggy');
CREATE TYPE public.upload_status AS ENUM ('pending', 'processing', 'processed', 'failed');
CREATE TYPE public.alert_severity AS ENUM ('critical', 'warning', 'info');
CREATE TYPE public.report_type AS ENUM ('daily', 'weekly', 'fortnightly', 'monthly');
CREATE TYPE public.report_format AS ENUM ('pdf', 'xlsx', 'csv');
CREATE TYPE public.audit_action AS ENUM (
  'restaurant_created','restaurant_edited','restaurant_archived','restaurant_restored',
  'restaurant_deleted','file_uploaded','report_generated','alert_acknowledged','user_role_changed'
);

-- Updated at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_auth" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- has_role helper
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Trigger: create profile + assign role on signup. First user = admin, rest = viewer.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
  assigned_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN assigned_role := 'admin'; ELSE assigned_role := 'viewer'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Restaurants
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  platform public.platform_type NOT NULL DEFAULT 'zomato',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES auth.users(id),
  archive_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurants TO authenticated;
GRANT ALL ON public.restaurants TO service_role;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "restaurants_select_auth" ON public.restaurants FOR SELECT TO authenticated USING (true);
CREATE POLICY "restaurants_admin_insert" ON public.restaurants FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "restaurants_admin_update" ON public.restaurants FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "restaurants_admin_delete" ON public.restaurants FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_restaurants_archived ON public.restaurants(is_archived);

-- Uploaded files
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  row_count INT DEFAULT 0,
  status public.upload_status NOT NULL DEFAULT 'pending',
  error_details JSONB,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_files TO authenticated;
GRANT ALL ON public.uploaded_files TO service_role;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_select_auth" ON public.uploaded_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "files_admin_write" ON public.uploaded_files FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "files_admin_update" ON public.uploaded_files FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Raw imports
CREATE TABLE public.raw_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_file_id UUID REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE SET NULL,
  date DATE,
  raw_row JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.raw_imports TO authenticated;
GRANT ALL ON public.raw_imports TO service_role;
ALTER TABLE public.raw_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "raw_imports_select_auth" ON public.raw_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "raw_imports_admin_write" ON public.raw_imports FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Daily metrics
CREATE TABLE public.daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  sales NUMERIC(14,2) DEFAULT 0,
  delivered_orders INT DEFAULT 0,
  average_order_value NUMERIC(14,2) DEFAULT 0,
  impressions INT DEFAULT 0,
  menu_to_order NUMERIC(8,4) DEFAULT 0,
  menu_to_cart NUMERIC(8,4) DEFAULT 0,
  cart_to_order NUMERIC(8,4) DEFAULT 0,
  sales_from_ads NUMERIC(14,2) DEFAULT 0,
  ad_ctr NUMERIC(8,4) DEFAULT 0,
  ads_orders INT DEFAULT 0,
  ads_impressions INT DEFAULT 0,
  ads_spend NUMERIC(14,2) DEFAULT 0,
  ads_roi NUMERIC(10,4) DEFAULT 0,
  gross_sales_from_offers NUMERIC(14,2) DEFAULT 0,
  orders_with_offers INT DEFAULT 0,
  discount_given NUMERIC(14,2) DEFAULT 0,
  effective_discount NUMERIC(8,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_metrics TO authenticated;
GRANT ALL ON public.daily_metrics TO service_role;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dm_select_auth" ON public.daily_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "dm_admin_insert" ON public.daily_metrics FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "dm_admin_update" ON public.daily_metrics FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "dm_admin_delete" ON public.daily_metrics FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_dm_restaurant_date ON public.daily_metrics(restaurant_id, date DESC);
CREATE INDEX idx_dm_date ON public.daily_metrics(date DESC);
CREATE TRIGGER trg_dm_updated BEFORE UPDATE ON public.daily_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  severity public.alert_severity NOT NULL,
  current_value NUMERIC(14,4),
  previous_value NUMERIC(14,4),
  pct_change NUMERIC(8,4),
  message TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_select_auth" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_admin_insert" ON public.alerts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "alerts_admin_update" ON public.alerts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_alerts_severity ON public.alerts(severity, acknowledged, detected_at DESC);

-- Reports
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by UUID REFERENCES auth.users(id),
  report_type public.report_type NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  restaurant_ids UUID[] NOT NULL DEFAULT '{}',
  format public.report_format NOT NULL,
  storage_path TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_select_auth" ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert_auth" ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Audit logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action public.audit_action NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_select_admin" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit_insert_auth" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
