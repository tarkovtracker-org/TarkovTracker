-- Keep resolved-receipt cleanup independent of an unresolved recovery backlog.
CREATE INDEX stripe_events_resolved_completion_idx ON public.stripe_events(completed_at)
  WHERE processing_state IN ('completed', 'terminal');
