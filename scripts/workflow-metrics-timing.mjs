export const duration = (start, end) =>
  start && end ? (Date.parse(end) - Date.parse(start)) / 60000 : null;
export async function measuredRun(run, { pages, api }) {
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const jobs = await pages(`actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
    const executed = jobs.filter(
      (job) => job.started_at && job.completed_at && job.conclusion !== 'skipped'
    );
    attempts.push({
      attempt,
      runner_minutes: executed.reduce(
        (sum, job) => sum + duration(job.started_at, job.completed_at),
        0
      ),
    });
  }
  const latest =
    run.run_attempt > 1 ? await api(`actions/runs/${run.id}/attempts/${run.run_attempt}`) : run;
  return {
    id: run.id,
    sha: run.head_sha,
    conclusion: run.conclusion,
    attempts,
    duration_minutes: duration(latest.run_started_at, latest.updated_at),
  };
}
