const fs = require('fs');

async function run() {
  const adminSecret = 'nhost-admin-secret';
  const url = 'http://localhost:8080/v1/metadata';
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret
  };

  const payload = {
    type: 'bulk',
    args: [
      {
        type: 'pg_create_event_trigger',
        args: {
          name: 'step_runs_notify',
          table: 'step_runs',
          webhook: 'http://host.docker.internal:3001/notifyEvent',
          update: {
            columns: ['status']
          },
          retry_conf: {
            num_retries: 2,
            interval_sec: 10,
            timeout_sec: 60
          }
        }
      }
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    console.log(await res.json());
  } catch (err) {
    console.error(err);
  }
}

run();
