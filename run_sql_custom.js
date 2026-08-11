const fs = require('fs');

async function run() {
  const adminSecret = 'nhost-admin-secret';
  const url = 'http://localhost:8080/v2/query';
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret
  };

  const sql = `
    CREATE TABLE IF NOT EXISTS public.custom_results (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
      run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
      data JSONB DEFAULT '{}'::jsonb NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
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
  
  console.log(await res.json());
}

run();
