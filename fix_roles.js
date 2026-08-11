async function run() {
  const res = await fetch('http://localhost:8080/v2/query', {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': 'nhost-admin-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'run_sql', args: { sql: "UPDATE public.org_members SET role = 'owner' WHERE role IS NULL;" } })
  });
  console.log(await res.json());
}
run();
