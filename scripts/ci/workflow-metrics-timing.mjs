export const duration = (start, end) =>
  start && end ? (Date.parse(end) - Date.parse(start)) / 60000 : null;
const seconds = (item) => {
  const minutes = duration(item?.started_at, item?.completed_at);
  return minutes === null ? null : Math.round(minutes * 60);
};
function testShard(job, shard) {
  const step = job?.steps?.find((item) => item.name === `Run shard ${shard}/4`);
  return { shard, job_seconds: seconds(job), vitest_seconds: seconds(step) };
}
function ciBalanceFields(jobs) {
  const byName = new Map(jobs.map((job) => [job.name, job]));
  if (byName.get('CI Result')?.conclusion !== 'success') return {};
  const supabase = byName.get('Supabase DB');
  const coverage = byName.get('Coverage thresholds');
  const shards = [1, 2, 3, 4].map((shard) =>
    testShard(byName.get(`Test (shard ${shard}/4)`), shard)
  );
  const measuredSeconds = [
    seconds(supabase),
    seconds(coverage),
    ...shards.map((shard) => shard.job_seconds),
  ];
  if (measuredSeconds.includes(null)) return {};
  const otherJobs = jobs.filter(
    (job) => !['Supabase DB', 'CI Result', 'Codebase metrics'].includes(job.name)
  );
  const otherEnd = Math.max(...otherJobs.map((job) => Date.parse(job.completed_at)));
  const gap = (Date.parse(supabase.completed_at) - otherEnd) / 1000;
  return {
    ci_balance: {
      supabase_job_seconds: seconds(supabase),
      supabase_only_gate_gap_seconds: Math.max(0, gap),
      coverage_job_seconds: seconds(coverage),
      shards,
    },
  };
}
export async function measuredRun(run, { pages, api }) {
  const attempts = [];
  for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
    const jobs = await pages(`actions/runs/${run.id}/attempts/${attempt}/jobs`, 'jobs');
    const executed = jobs.filter(
      (job) => job.started_at && job.completed_at && job.conclusion !== 'skipped'
    );
    attempts.push({
      attempt,
      ...ciBalanceFields(executed),
      runner_minutes: executed.reduce(
        (sum, job) => sum + duration(job.started_at, job.completed_at),
        0
      ),
    });
  }
  return {
    id: run.id,
    sha: run.head_sha,
    conclusion: run.conclusion,
    attempts,
    ...(await measuredDuration(run, api)),
  };
}
async function measuredDuration(run, api) {
  try {
    const latest =
      run.run_attempt > 1 ? await api(`actions/runs/${run.id}/attempts/${run.run_attempt}`) : run;
    return { duration_minutes: duration(latest.run_started_at, latest.updated_at) };
  } catch (error) {
    return { duration_minutes: null, duration_unavailable: error.message.split('\n')[0] };
  }
}
