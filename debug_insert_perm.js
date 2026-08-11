async function run() {
  const req = {
    type: 'pg_create_insert_permission',
    args: {
      table: 'org_members',
      role: 'user',
      permission: {
        columns: '*',
        check: { user_id: { _eq: "X-Hasura-User-Id" } }, 
        set: { user_id: "X-Hasura-User-Id" }
      }
    }
  };
  const res = await fetch('http://localhost:8080/v1/metadata', {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': 'nhost-admin-secret', 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
