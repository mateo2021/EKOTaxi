-- Najwyżej jeden aktywny kurs na użytkownika (chroni przed równoległym POST /api/rides).
create unique index if not exists rides_one_active_per_user
  on public.rides (user_id)
  where status in ('searching', 'accepted', 'in_progress');
