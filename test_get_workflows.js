async function run() {
  const req = {
    query: `
      query GetWorkflows {
        workflows {
          id
        }
      }
    `
  };
  const res = await fetch('http://localhost:8080/v1/graphql', {
    method: 'POST',
    headers: { 
      'x-hasura-admin-secret': 'nhost-admin-secret', 
      'x-hasura-role': 'user',
      'x-hasura-user-id': '55555555-5555-5555-5555-555555555555',
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(req)
  });
  console.log(JSON.stringify(await res.json(), null, 2));
}
run();
