const fs = require('fs');

async function run() {
  const adminSecret = 'nhost-admin-secret';
  const metadataUrl = 'http://localhost:8080/v1/metadata';
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret
  };

  const requests = [
    { type: 'pg_drop_select_permission', args: { table: 'workflow_runs', role: 'user' } },
    { type: 'pg_drop_select_permission', args: { table: 'step_runs', role: 'user' } },
    { type: 'drop_action', args: { name: 'triggerWorkflowRun', clear_data: true } },
    { type: 'drop_action', args: { name: 'approveStep', clear_data: true } },
    {
      type: 'bulk',
      args: [
        {
          type: 'pg_create_select_permission',
          args: {
            table: 'workflow_runs',
            role: 'user',
            permission: {
              columns: '*',
              filter: {
                workflow: {
                  organization: {
                    members: {
                      user_id: { _eq: "X-Hasura-User-Id" }
                    }
                  }
                }
              }
            }
          }
        },
        {
          type: 'pg_create_select_permission',
          args: {
            table: 'step_runs',
            role: 'user',
            permission: {
              columns: '*',
              filter: {
                workflow_run: {
                  workflow: {
                    organization: {
                      members: {
                        user_id: { _eq: "X-Hasura-User-Id" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        {
          type: 'set_custom_types',
          args: {
            objects: [
              {
                name: 'TriggerWorkflowOutput',
                fields: [
                  { name: 'success', type: 'Boolean!' },
                  { name: 'workflow_run_id', type: 'uuid' },
                  { name: 'message', type: 'String' }
                ]
              },
              {
                name: 'ApproveStepOutput',
                fields: [
                  { name: 'success', type: 'Boolean!' },
                  { name: 'message', type: 'String' }
                ]
              }
            ]
          }
        },
        {
          type: 'create_action',
          args: {
            name: 'triggerWorkflowRun',
            definition: {
              handler: 'http://host.docker.internal:3001/triggerWorkflowRun',
              forward_client_headers: true,
              kind: 'synchronous',
              type: 'mutation',
              arguments: [
                { name: 'workflow_id', type: 'uuid!' }
              ],
              output_type: 'TriggerWorkflowOutput'
            }
          }
        },
        {
          type: 'create_action',
          args: {
            name: 'approveStep',
            definition: {
              handler: 'http://host.docker.internal:3001/approveStep',
              forward_client_headers: true,
              kind: 'synchronous',
              type: 'mutation',
              arguments: [
                { name: 'step_run_id', type: 'uuid!' }
              ],
              output_type: 'ApproveStepOutput'
            }
          }
        },
        {
          type: 'create_action_permission',
          args: {
            action: 'triggerWorkflowRun',
            role: 'user'
          }
        },
        {
          type: 'create_action_permission',
          args: {
            action: 'approveStep',
            role: 'user'
          }
        }
      ]
    }
  ];

  for (const req of requests) {
    try {
      const res = await fetch(metadataUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(req)
      });
      const data = await res.json();
      console.log(`Req: ${req.type} ->`, data);
    } catch (err) {
      console.error(err);
    }
  }
}

run();
