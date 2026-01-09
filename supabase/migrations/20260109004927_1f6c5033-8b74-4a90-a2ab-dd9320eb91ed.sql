-- Update the signup trigger to assign admin role instead of staff
CREATE OR REPLACE FUNCTION public.assign_staff_role_on_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Assign admin role to specific email
  IF NEW.email = 'streeteatzwaterford@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;