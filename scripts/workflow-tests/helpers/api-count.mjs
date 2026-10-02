/** Count mock API invocations without adding network latency to controller benchmarks. */
export function countApiCalls(github) {
  const counts = { total: 0 };
  const wrap =
    (fn) =>
    (...args) => {
      counts.total += 1;
      return fn(...args);
    };
  for (const group of Object.values(github.rest)) {
    for (const [name, fn] of Object.entries(group)) {
      if (typeof fn === 'function') group[name] = wrap(fn);
    }
  }
  github.paginate = wrap(github.paginate);
  github.graphql = wrap(github.graphql);
  return counts;
}
