-- Restore EXECUTE so RLS policies that call has_role() work again
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Harden has_role: always check the caller's own roles, ignoring the
-- _user_id argument. Existing policies pass auth.uid() so behavior is
-- unchanged for legitimate use, but RPC enumeration of other users is
-- prevented.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  )
$$;