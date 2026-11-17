-- Expense categories: any active user may add a category (custom category from the expense form).
-- Updates/renames remain su_admin only.
drop policy if exists categories_write on public.expense_categories;
create policy categories_write on public.expense_categories
  for insert to authenticated
  with check (is_active_user());
