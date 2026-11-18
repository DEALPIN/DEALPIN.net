-- Dealpin storage rules for Supabase (round 7). Run after schema.sql.
-- One bucket, deal-media. Files are served by long random addresses (128 bits), so only people who were given
-- a link can fetch a file; the bucket cannot be listed. Limits and types are enforced by the bucket itself.
--   s/<seller id>/<random>.jpg          seller product photos (seller signed in)
--   b/<hash of buyer token>/<random>.*  buyer voice note, dispute photo (buyer holds the token; the hash is
--                                        derived from it, so a file path never reveals the token)
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('deal-media','deal-media',true,2097152,array['image/jpeg','audio/webm','audio/ogg','audio/mp4'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function upload_key_ok(k text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from deals where buyer_key=k and status in('created','agreed','shipped')) $$;

create function owns_media(p_name text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from deals where owner=auth.uid() and position(p_name in doc::text)>0) $$;

grant execute on function upload_key_ok,owns_media to anon,authenticated;

create policy "buyer uploads" on storage.objects for insert to anon,authenticated
  with check(bucket_id='deal-media' and name ~ '^b/[0-9a-f]{64}/[0-9a-f]{32}\.(jpg|webm|ogg|m4a)$'
             and public.upload_key_ok((storage.foldername(name))[2]));
create policy "seller uploads" on storage.objects for insert to authenticated
  with check(bucket_id='deal-media' and name ~ ('^s/'||(select auth.uid())::text||'/[0-9a-f]{32}\.jpg$'));
create policy "seller deletes own files" on storage.objects for delete to authenticated
  using(bucket_id='deal-media' and (name like 's/'||(select auth.uid())::text||'/%' or public.owns_media(name)));
