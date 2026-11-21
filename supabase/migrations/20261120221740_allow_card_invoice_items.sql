-- Preserve manual invoice validation while allowing purchase details in the same card cycle.
create or replace function public.valid_household_financial_data(p_data jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  plan jsonb;
  revision jsonb;
begin
  if p_data is null or jsonb_typeof(p_data) is distinct from 'object'
    or p_data->>'schema' is distinct from '1'
    or jsonb_typeof(p_data->'accounts') is distinct from 'array'
    or jsonb_typeof(p_data->'categories') is distinct from 'array'
    or jsonb_typeof(p_data->'entries') is distinct from 'array'
    or octet_length(p_data::text) > 5000000 then
    return false;
  end if;
  if (p_data ? 'recurrences' and jsonb_typeof(p_data->'recurrences') is distinct from 'array')
    or (p_data ? 'manualInvoices' and jsonb_typeof(p_data->'manualInvoices') is distinct from 'array')
    or (p_data ? 'invoiceRecurrences' and jsonb_typeof(p_data->'invoiceRecurrences') is distinct from 'array') then
    return false;
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_data->'manualInvoices', '[]'::jsonb)) loop
    if nullif(item->>'id', '') is null
      or nullif(item->>'cardId', '') is null
      or coalesce(item->>'competence', '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or coalesce(item->>'dueDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(item->>'total', '') !~ '^[0-9]+$'
      or (item->>'total')::numeric not between 1 and 100000000000
      or to_char(to_date(item->>'dueDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> item->>'dueDate'
      or not exists (
        select 1 from jsonb_array_elements(p_data->'accounts') a(value)
        where a.value->>'id' = item->>'cardId' and a.value->>'type' = 'card'
      ) then
      return false;
    end if;
    if item->>'recurrenceId' is not null and item->>'recurrenceId' <> 'null'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_data->'invoiceRecurrences', '[]'::jsonb)) r(value)
        where r.value->>'id' = item->>'recurrenceId' and r.value->>'cardId' = item->>'cardId'
      ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data->'manualInvoices', '[]'::jsonb)) a(value)
    join jsonb_array_elements(coalesce(p_data->'manualInvoices', '[]'::jsonb)) b(value)
      on a.value->>'cardId' = b.value->>'cardId'
      and a.value->>'competence' = b.value->>'competence'
      and a.value->>'id' < b.value->>'id'
  ) then
    return false;
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_data->'manualInvoices', '[]'::jsonb)) mi(value)
    join lateral (
      select coalesce(sum((e.value->>'amount')::numeric), 0) as amount
      from jsonb_array_elements(p_data->'entries') e(value)
      where e.value->>'type' = 'transfer' and e.value->>'invoice' = ('manual:' || (mi.value->>'id'))
    ) payments on true
    where payments.amount > (mi.value->>'total')::numeric
  ) then
    return false;
  end if;

  for plan in select value from jsonb_array_elements(coalesce(p_data->'invoiceRecurrences', '[]'::jsonb)) loop
    if nullif(plan->>'id', '') is null
      or nullif(plan->>'cardId', '') is null
      or coalesce(plan->>'startMonth', '') !~ '^\d{4}-(0[1-9]|1[0-2])$'
      or (plan->>'endMonth' is not null and plan->>'endMonth' <> 'null' and coalesce(plan->>'endMonth', '') !~ '^\d{4}-(0[1-9]|1[0-2])$')
      or coalesce(plan->>'amount', '') !~ '^[0-9]+$'
      or (plan->>'amount')::numeric not between 1 and 100000000000
      or coalesce(plan->>'dueDay', '') !~ '^[0-9]+$'
      or (plan->>'dueDay')::integer not between 1 and 31
      or coalesce(plan->>'status', '') not in ('active', 'paused', 'ended')
      or not exists (
        select 1 from jsonb_array_elements(p_data->'accounts') a(value)
        where a.value->>'id' = plan->>'cardId' and a.value->>'type' = 'card'
      ) then
      return false;
    end if;
    if plan->>'endMonth' is not null and plan->>'endMonth' <> 'null' and plan->>'endMonth' < plan->>'startMonth' then
      return false;
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_data->'invoiceRecurrences', '[]'::jsonb)) a(value)
    join jsonb_array_elements(coalesce(p_data->'invoiceRecurrences', '[]'::jsonb)) b(value)
      on a.value->>'cardId' = b.value->>'cardId'
      and a.value->>'id' < b.value->>'id'
      and a.value->>'status' <> 'ended'
      and b.value->>'status' <> 'ended'
      and a.value->>'startMonth' <= coalesce(nullif(b.value->>'endMonth', 'null'), '9999-12')
      and b.value->>'startMonth' <= coalesce(nullif(a.value->>'endMonth', 'null'), '9999-12')
  ) then
    return false;
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_data->'recurrences', '[]'::jsonb)) loop
    if nullif(item->>'id', '') is null
      or nullif(btrim(item->>'description'), '') is null
      or coalesce(item->>'amount', '') !~ '^[0-9]+$'
      or (item->>'amount')::numeric not between 1 and 100000000000
      or coalesce(item->>'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or to_char(to_date(item->>'startDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> item->>'startDate'
      or coalesce(item->>'frequency', '') not in ('weekly', 'monthly', 'yearly')
      or coalesce(item->>'status', '') not in ('active', 'paused', 'ended')
      or jsonb_typeof(item->'pauses') is distinct from 'array'
      or jsonb_typeof(item->'overrides') is distinct from 'array'
      or jsonb_typeof(item->'settledOccurrences') is distinct from 'array'
      or not exists (
        select 1 from jsonb_array_elements(p_data->'accounts') a(value)
        where a.value->>'id' = item->>'account'
      )
      or not exists (
        select 1 from jsonb_array_elements(p_data->'categories') c(value)
        where c.value->>'id' = item->>'category'
      ) then
      return false;
    end if;
    if item->>'endDate' is not null and item->>'endDate' <> 'null'
      and (coalesce(item->>'endDate', '') !~ '^\d{4}-\d{2}-\d{2}$' or to_char(to_date(item->>'endDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> item->>'endDate' or item->>'endDate' < item->>'startDate') then
      return false;
    end if;
    if item ? 'revisions' and jsonb_typeof(item->'revisions') is distinct from 'array' then return false; end if;
    for revision in select value from jsonb_array_elements(coalesce(item->'revisions', '[]'::jsonb)) loop
      if coalesce(revision->>'fromIndex', '') !~ '^[0-9]+$'
        or coalesce(revision->>'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char(to_date(revision->>'startDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') <> revision->>'startDate'
        or coalesce(revision->>'frequency', '') not in ('weekly', 'monthly', 'yearly')
        or coalesce(revision->>'amount', '') !~ '^[0-9]+$'
        or (revision->>'amount')::numeric not between 1 and 100000000000
        or nullif(revision->>'description', '') is null
        or not exists (select 1 from jsonb_array_elements(p_data->'accounts') a(value) where a.value->>'id'=revision->>'account')
        or not exists (select 1 from jsonb_array_elements(p_data->'categories') c(value) where c.value->>'id'=revision->>'category') then
        return false;
      end if;
    end loop;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
