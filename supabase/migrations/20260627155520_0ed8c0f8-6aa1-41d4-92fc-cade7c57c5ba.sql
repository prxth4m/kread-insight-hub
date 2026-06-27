ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS data_date DATE;
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_restaurant_metric_date_key;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_restaurant_metric_date_key UNIQUE (restaurant_id, metric_name, data_date);