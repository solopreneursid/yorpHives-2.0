export function mockD1() {
  const buckets = new Map();
  const usage = [];
  return {
    usage,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() {
          if (sql.includes("INSERT INTO rate_limit_windows")) {
            const [key, windowStart] = values;
            const previous = buckets.get(key);
            const count = previous?.windowStart === windowStart ? previous.count + 1 : 1;
            buckets.set(key, { windowStart, count });
            return { request_count: count };
          }
          throw new Error("Unexpected mock D1 first query: " + sql);
        },
        async run() {
          if (sql.includes("INSERT INTO usage_ledger")) {
            usage.push(values);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE api_keys")) return { success: true, meta: { changes: 1 } };
          throw new Error("Unexpected mock D1 run query: " + sql);
        }
      };
      return statement;
    }
  };
}
