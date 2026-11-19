-- Run once in a NEW Supabase project. No existing project is modified automatically.
-- Then apply SQL files in supabase/migrations in date order for newer safeguards.
begin;
create table public.households (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 data jsonb not null check(jsonb_typeof(data)='object' and data->>'schema'='1' and jsonb_typeof(data->'entries')='array'),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create index households_owner_idx on public.households(owner_id);
create table public.household_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 household_id uuid not null references public.households(id) on delete cascade
);
create index household_members_house_idx on public.household_members(household_id);
create table public.household_invitations (
 token_hash text primary key,
 household_id uuid not null references public.households(id) on delete cascade,
 email text not null,
 expires_at timestamptz not null default now()+interval '7 days',
 created_at timestamptz not null default now(),
 accepted_at timestamptz
);
create index household_invites_house_idx on public.household_invitations(household_id);
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
revoke all on public.households,public.household_members,public.household_invitations from anon,authenticated;
grant select on public.households,public.household_members to authenticated;
grant all on public.households,public.household_members,public.household_invitations to service_role;
create policy invitations_server_only on public.household_invitations for all to authenticated using(false) with check(false);
create policy own_membership on public.household_members for select to authenticated using(user_id=(select auth.uid()));
create policy shared_household on public.households for select to authenticated using (
 exists(select 1 from public.household_members m where m.user_id=(select auth.uid()) and m.household_id=households.id)
);
-- Privileged RPCs are necessary for atomic onboarding and optimistic locking.
-- Each explicitly validates auth.uid; the browser cannot write membership or owner fields.
create function public.bootstrap_household(p_initial jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h public.households; u uuid:=auth.uid();
begin
 if u is null then raise exception 'Autenticação necessária'; end if;
 perform pg_advisory_xact_lock(hashtext(u::text));
 select x.* into h from public.households x join public.household_members m on m.household_id=x.id where m.user_id=u;
 if h.id is null then
  if p_initial->>'schema' is distinct from '1' or jsonb_typeof(p_initial->'entries') is distinct from 'array' then raise exception 'Dados inválidos'; end if;
  insert into public.households(owner_id,data) values(u,p_initial) returning * into h;
  insert into public.household_members(user_id,household_id) values(u,h.id);
 end if;
 return jsonb_build_object('id',h.id,'data',h.data,'version',h.version);
end $$;
create function public.save_household(p_id uuid,p_version integer,p_data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if auth.uid() is null or not exists(select 1 from public.household_members where household_id=p_id and user_id=auth.uid()) then raise exception 'Acesso negado'; end if;
 if p_data->>'schema' is distinct from '1' or jsonb_typeof(p_data->'entries') is distinct from 'array' or jsonb_typeof(p_data->'accounts') is distinct from 'array' or jsonb_typeof(p_data->'categories') is distinct from 'array' or octet_length(p_data::text)>5000000 then raise exception 'Dados inválidos ou muito grandes'; end if;
 update public.households set data=p_data,version=version+1,updated_at=now() where id=p_id and version=p_version returning version into v;
 if v is null then raise exception 'Outra pessoa alterou os dados. Aguarde a atualização ou recarregue e tente novamente.'; end if;
 return v;
end $$;
create function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.household_invitations; mail text; old_house uuid; u uuid:=auth.uid();
begin
 if u is null then raise exception 'Autenticação necessária'; end if;
 select lower(email) into mail from auth.users where id=u and email_confirmed_at is not null;
 if mail is null then raise exception 'Confirme seu e-mail antes de aceitar o convite'; end if;
 select * into inv from public.household_invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if inv.token_hash is null or inv.expires_at<now() or lower(inv.email)<>mail then raise exception 'Convite inválido, expirado ou destinado a outro e-mail'; end if;
 if exists(select 1 from public.household_members where user_id=u and household_id=inv.household_id) then return; end if; if inv.accepted_at is not null then raise exception 'Convite já utilizado'; end if; perform 1 from public.households where id=inv.household_id for update;
 if (select count(*) from public.household_members where household_id=inv.household_id)>=2 then raise exception 'A casa já tem dois membros'; end if;
 select household_id into old_house from public.household_members where user_id=u;
 if old_house=inv.household_id then return; end if;
 if old_house is not null then
  if not exists(select 1 from public.households where id=old_house and owner_id=u and jsonb_array_length(data->'entries')=0 and jsonb_array_length(data->'accounts')=0)
   or (select count(*) from public.household_members where household_id=old_house)>1 then raise exception 'Sua conta já pertence a uma casa com dados. Exporte-os e resolva a associação antes de aceitar.'; end if;
  delete from public.households where id=old_house;
 end if;
 insert into public.household_members(user_id,household_id) values(u,inv.household_id);
 update public.household_invitations set accepted_at=now() where token_hash=inv.token_hash;
end $$;
revoke all on function public.bootstrap_household(jsonb),public.save_household(uuid,integer,jsonb),public.accept_invitation(text) from public,anon;
grant execute on function public.bootstrap_household(jsonb),public.save_household(uuid,integer,jsonb),public.accept_invitation(text) to authenticated;
commit;
