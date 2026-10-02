alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add constraint profiles_username_format check(username is null or username ~ '^[a-z0-9_]{3,30}$');
create unique index profiles_username_unique on public.profiles(username) where username is not null;
alter table public.profiles add constraint profiles_onboarding_complete check(onboarding_completed_at is null or
(length(btrim(full_name))>=2 and username is not null and length(regexp_replace(phone,'[^0-9]','','g')) between 10 and 15
and full_name is not null and phone is not null));
