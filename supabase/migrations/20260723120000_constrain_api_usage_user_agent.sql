ALTER TABLE public.api_usage_daily
  ALTER COLUMN user_agent TYPE VARCHAR(200)
  USING LEFT(user_agent, 200);
