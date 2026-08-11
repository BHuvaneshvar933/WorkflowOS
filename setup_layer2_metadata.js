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
      // Drop existing insert permission on workflow_steps
      {
        type: 'pg_drop_insert_permission',
        args: { table: 'workflow_steps', role: 'user' }
      },
      // Re-create insert permission for workflow_steps (Layer 2 Gating)
      {
        type: 'pg_create_insert_permission',
        args: {
          table: 'workflow_steps',
          role: 'user',
          permission: {
            columns: '*',
            check: {
              _or: [
                {
                  _and: [
                    { type: { _in: ["llm_call", "http_request", "conditional_branch", "approval_gate"] } },
                    { workflow: { organization: { members: { _and: [ { user_id: { _eq: "X-Hasura-User-Id" } }, { role: { _in: ["owner", "editor"] } } ] } } } }
                  ]
                },
                {
                  _and: [
                    { type: { _in: ["db_write", "notify"] } },
                    { workflow: { organization: { members: { _and: [ { user_id: { _eq: "X-Hasura-User-Id" } }, { role: { _eq: "owner" } } ] } } } }
                  ]
                }
              ]
            }
          }
        }
      },
      // INSERT permission for workflow_triggers (Layer 2 Gating)
      {
        type: 'pg_drop_insert_permission',
        args: { table: 'workflow_triggers', role: 'user' }
      },
      {
        type: 'pg_create_insert_permission',
        args: {
          table: 'workflow_triggers',
          role: 'user',
          permission: {
            columns: '*',
            check: {
              _or: [
                {
                  _and: [
                    { trigger_type: { _eq: "manual" } },
                    { workflow: { organization: { members: { _and: [ { user_id: { _eq: "X-Hasura-User-Id" } }, { role: { _in: ["owner", "editor"] } } ] } } } }
                  ]
                },
                {
                  _and: [
                    { trigger_type: { _in: ["webhook", "scheduled", "event"] } },
                    { workflow: { organization: { members: { _and: [ { user_id: { _eq: "X-Hasura-User-Id" } }, { role: { _eq: "owner" } } ] } } } }
                  ]
                }
              ]
            }
          }
        }
      }
    ]
  };

  for (let req of payload.args) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'bulk', args: [req] })
      });
      const data = await res.json();
      console.log(`Req: ${req.type} ->`, JSON.stringify(data));
    } catch (err) {
      console.error(err);
    }
  }
}

run();
