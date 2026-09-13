-- Read-only aggregate monitoring, candidate schema only. No identities or provider resources.
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT kind,state,count(*) AS work_count,
 max(clock_timestamp()-available_at) FILTER(WHERE state IN ('received','retryable','waiting') AND available_at<=clock_timestamp()) AS oldest_due,
 count(*) FILTER(WHERE state='processing' AND lease_until<clock_timestamp()-interval '3 minutes') AS expired_leases,
 count(*) FILTER(WHERE state='retryable' AND (attempts>=10 OR first_failure_at<clock_timestamp()-interval '20 hours')) AS near_review
FROM private.lifecycle_work GROUP BY kind,state ORDER BY kind,state;
SELECT state,reason,count(*) AS request_count,min(created_at) AS oldest_request
FROM private.lifecycle_requests GROUP BY state,reason ORDER BY state,reason;
SELECT kind,error_code,count(*) AS unfinished_errors
FROM private.lifecycle_work WHERE state IN ('retryable','blocked','dead_letter')
GROUP BY kind,error_code ORDER BY kind,error_code;
COMMIT;
