ALTER TABLE public.daily_metrics
  ALTER COLUMN delivered_orders TYPE numeric USING delivered_orders::numeric,
  ALTER COLUMN impressions TYPE numeric USING impressions::numeric,
  ALTER COLUMN ads_orders TYPE numeric USING ads_orders::numeric,
  ALTER COLUMN ads_impressions TYPE numeric USING ads_impressions::numeric,
  ALTER COLUMN orders_with_offers TYPE numeric USING orders_with_offers::numeric;