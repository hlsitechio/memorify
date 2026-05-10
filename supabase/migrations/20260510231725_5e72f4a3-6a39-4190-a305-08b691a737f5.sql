
insert into storage.buckets (id, name, public) values
  ('memories','memories',false),
  ('logs','logs',false),
  ('events','events',false),
  ('skills','skills',false)
on conflict (id) do nothing;

create policy "user_buckets_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id in ('memories','logs','events','skills')
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "user_buckets_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('memories','logs','events','skills')
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "user_buckets_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id in ('memories','logs','events','skills')
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "user_buckets_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('memories','logs','events','skills')
  and auth.uid()::text = (storage.foldername(name))[1]
);
