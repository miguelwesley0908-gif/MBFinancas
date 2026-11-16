begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
('11111111-1111-4111-8111-111111111111','owner@example.invalid',now(),'authenticated','authenticated'),
('22222222-2222-4222-8222-222222222222','member@example.invalid',now(),'authenticated','authenticated'),
('33333333-3333-4333-8333-333333333333','stranger@example.invalid',now(),'authenticated','authenticated');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select set_config('test.house', (public.bootstrap_household('{"schema":1,"income":0,"accounts":[],"categories":[],"entries":[]}'::jsonb)->>'id'),true);
do $$ begin
 if (select count(*) from public.households)<>1 then raise exception 'FAIL owner visibility'; end if;
 if public.save_household(current_setting('test.house')::uuid,1,'{"schema":1,"income":10000,"accounts":[],"categories":[],"entries":[]}'::jsonb)<>2 then raise exception 'FAIL save'; end if;
 begin
 perform public.save_household(current_setting('test.house')::uuid,1,'{"schema":1,"accounts":[],"categories":[],"entries":[]}'::jsonb);
 raise exception 'FAIL stale version accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
 if (select count(*) from public.households)<>0 then raise exception 'FAIL tenant isolation'; end if;
 begin
 perform public.save_household(current_setting('test.house')::uuid,2,'{"schema":1,"accounts":[],"categories":[],"entries":[]}'::jsonb);
 raise exception 'FAIL unauthorized write accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
reset role;
insert into public.household_invitations(token_hash,household_id,email) values
(encode(sha256(convert_to('integration-test-token','UTF8')),'hex'),current_setting('test.house')::uuid,'member@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
do $$ begin
 begin perform public.accept_invitation('integration-test-token'); raise exception 'FAIL wrong email accepted';
 exception when others then if sqlerrm like 'FAIL%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select public.accept_invitation('integration-test-token');
select public.accept_invitation('integration-test-token');
do $$ begin
 if (select count(*) from public.households)<>1 then raise exception 'FAIL member access'; end if;
 if public.save_household(current_setting('test.house')::uuid,2,'{"schema":1,"income":20000,"accounts":[],"categories":[],"entries":[]}'::jsonb)<>3 then raise exception 'FAIL shared write'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.save_household(uuid,integer,jsonb)','execute') then raise exception 'FAIL anonymous RPC access'; end if;
 if has_table_privilege('authenticated','public.household_members','insert') then raise exception 'FAIL membership escalation'; end if;
end $$;
select 'PASS: owner/member access, tenant isolation, stale-version rejection, invite email matching/idempotency, anonymous denial, membership protection' as result;
rollback;