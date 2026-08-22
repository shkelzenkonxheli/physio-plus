-- PostgREST requires column SELECT privilege when the public listing flag is
-- used as a filter, even though it is not returned in profile payloads.
GRANT SELECT (directory_listing_enabled)
  ON public.physiotherapists TO anon, authenticated;

