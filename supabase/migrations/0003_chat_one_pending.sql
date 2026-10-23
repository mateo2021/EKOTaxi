-- Czat: najwyżej jedno oczekujące pytanie na użytkownika.
-- Chroni limit Claude właściciela przed skryptowym zasypywaniem pytaniami: kolejne
-- pytanie można wysłać dopiero, gdy worker odpowie na poprzednie (done/error).
-- Zastępuje politykę INSERT z 0001_init.sql (ta sama nazwa).
drop policy if exists chat_messages_insert_own on public.chat_messages;
create policy chat_messages_insert_own on public.chat_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and answer is null
    and not exists (
      select 1
      from public.chat_messages c
      where c.user_id = auth.uid()
        and c.status = 'pending'
    )
  );
