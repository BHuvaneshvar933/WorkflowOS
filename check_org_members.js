async function run() {
  const res = await fetch('http://localhost:8080/v2/query', {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': 'nhost-admin-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'run_sql', args: { sql: "SELECT * FROM public.org_members;" } })
  });
  console.log(await res.json());
}
run();
