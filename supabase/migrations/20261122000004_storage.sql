-- =====================================================================
-- JAMJAMOFF ORDER — 0004 Storage (현장/시공 사진)
--   경로 규칙 : order-files/{order_id}/{uuid}-{파일명}
--   비공개 버킷, 발주를 볼 수 있는 사용자만 업로드/조회 (signed URL 사용)
-- =====================================================================
do $$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'storage 스키마가 없어 건너뜁니다 (로컬 테스트 환경).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('order-files', 'order-files', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
  on conflict (id) do nothing;

  execute $p$
    create policy order_files_select on storage.objects for select to authenticated
      using (bucket_id = 'order-files'
             and public.can_view_order(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy order_files_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'order-files'
                  and public.can_view_order(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy order_files_delete on storage.objects for delete to authenticated
      using (bucket_id = 'order-files' and public.is_admin())
  $p$;
end $$;
