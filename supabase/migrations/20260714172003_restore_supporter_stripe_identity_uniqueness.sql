BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.supporters
    WHERE stripe_customer_id IS NOT NULL
    GROUP BY stripe_customer_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Stripe customer IDs prevent supporter uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supporters
    WHERE stripe_subscription_id IS NOT NULL
    GROUP BY stripe_subscription_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate Stripe subscription IDs prevent supporter uniqueness';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporters_stripe_customer
  ON public.supporters(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_supporters_stripe_subscription
  ON public.supporters(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMIT;
