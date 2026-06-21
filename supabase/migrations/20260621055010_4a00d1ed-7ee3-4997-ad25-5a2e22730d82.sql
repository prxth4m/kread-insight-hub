
CREATE POLICY "uploads_admin_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'uploads' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'uploads' AND public.has_role(auth.uid(), 'admin'));
