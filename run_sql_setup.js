const fs = require('fs');

async function run() {
  const adminSecret = 'nhost-admin-secret';
  const url = 'http://localhost:8080/v2/query';
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret
  };

  const sql = `
    SELECT column_name FROM information_schema.columns WHERE table_name = 'workflow_triggers';
  `;

  const payload = {
    type: 'run_sql',
    args: {
      source: 'default',
      sql: sql,
      cascade: true
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  console.log('Run SQL:', data);
}

run();
