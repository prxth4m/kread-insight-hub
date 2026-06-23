-- Restrict raw_imports SELECT to admins only
DROP POLICY IF EXISTS "raw_imports_select_auth" ON public.raw_imports;
CREATE POLICY "raw_imports_select_admin" ON public.raw_imports
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Restrict uploaded_files SELECT to uploader or admin
DROP POLICY IF EXISTS "files_select_auth" ON public.uploaded_files;
CREATE POLICY "files_select_own_or_admin" ON public.uploaded_files
  FOR SELECT TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Defense-in-depth: explicit admin-only INSERT/UPDATE/DELETE policies on user_roles
-- (handle_new_user runs as SECURITY DEFINER and bypasses these.)
DROP POLICY IF EXISTS "user_roles_admin_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_delete" ON public.user_roles;
CREATE POLICY "user_roles_admin_insert" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_update" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));