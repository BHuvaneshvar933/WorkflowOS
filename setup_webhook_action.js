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
        type: 'set_custom_types',
        args: {
          input_objects: [],
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
            },
            {
              name: 'WebhookTriggerResponse',
              fields: [
                { name: 'id', type: 'uuid!' },
                { name: 'status', type: 'String!' },
                { name: 'message', type: 'String!' }
              ]
            }
          ],
          scalars: []
        }
      },
      {
        type: 'create_action',
        args: {
          name: 'webhookTrigger',
          definition: {
            handler: 'http://host.docker.internal:3001/webhookTrigger',
            output_type: 'WebhookTriggerResponse',
            type: 'mutation',
            arguments: [
              { name: 'trigger_id', type: 'uuid!' },
              { name: 'data', type: 'jsonb' }
            ],
            forward_client_headers: false // No need to forward client headers since webhooks are public
          }
        }
      },
      // Give permission to 'anonymous' and 'user' and 'public'
      {
        type: 'create_action_permission',
        args: {
          action: 'webhookTrigger',
          role: 'anonymous'
        }
      },
      {
        type: 'create_action_permission',
        args: {
          action: 'webhookTrigger',
          role: 'user'
        }
      },
      {
        type: 'create_action_permission',
        args: {
          action: 'webhookTrigger',
          role: 'public'
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
