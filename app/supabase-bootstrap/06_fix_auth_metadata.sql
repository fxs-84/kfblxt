-- 单语句替换 handle_new_user 函数体,Postgres 用 OID 引用所以现有 trigger 自动用新版
-- 不需要 DROP,不需要重建 trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER set search_path = public AS $$
DECLARE r public.user_role; n text;
BEGIN
  r := CASE lower(coalesce(new.raw_user_meta_data->>'role',''))
    WHEN 'admin' THEN 'admin'::public.user_role
    WHEN 'physician' THEN 'physician'::public.user_role
    WHEN 'therapist' THEN 'therapist'::public.user_role
    ELSE 'therapist'::public.user_role END;
  IF (SELECT count(*) FROM public.profiles) = 0 THEN r := 'admin'::public.user_role; END IF;
  n := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), nullif(trim(new.raw_user_meta_data->>'username'),''), split_part(new.email,'@',1));
  INSERT INTO public.profiles(id, org_id, full_name, role) VALUES (new.id, '00000000-0000-0000-0000-000000000001', n, r);
  RETURN new;
END $$;
