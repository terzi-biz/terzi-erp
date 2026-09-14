-- Один активний профіль ФОП на співробітника. Історію не видаляємо:
-- дублікати закриваються датою (valid_to), рядки лишаються в базі.
WITH ranked AS (
  SELECT id, employee_id, valid_from,
         ROW_NUMBER() OVER (PARTITION BY employee_id ORDER BY valid_from DESC, created_at DESC) AS rn,
         MAX(valid_from) OVER (PARTITION BY employee_id) AS newest_from
  FROM public.payroll_profiles
  WHERE valid_to IS NULL
)
UPDATE public.payroll_profiles p
SET valid_to = GREATEST(r.valid_from, r.newest_from)
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_profiles_one_active_idx
  ON public.payroll_profiles (employee_id)
  WHERE valid_to IS NULL;