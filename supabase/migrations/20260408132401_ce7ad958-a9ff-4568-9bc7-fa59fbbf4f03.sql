UPDATE public.site_copy 
SET copy_json = jsonb_set(
  copy_json, 
  '{features,fmly_hook}', 
  'true'::jsonb
)
WHERE id = '03312b1e-e721-454e-9df9-fcc9d98004a4';