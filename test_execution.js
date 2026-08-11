const fs = require('fs');

async function graphqlRequest(query, variables, headers) {
  const res = await fetch('http://localhost:8080/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ query, variables })
  });
  return res.json();
}

async function run() {
  console.log('Testing Phase 5 & 6: Execution Engine & Approval...');

  const adminHeaders = { 'x-hasura-admin-secret': 'nhost-admin-secret' };
  const userId = '33333333-3333-3333-3333-333333333333';

  // 1. Create Org
  const CREATE_ORG = `
    mutation CreateOrg($name: String!, $userId: uuid!) {
      insert_organizations_one(object: {
        name: $name,
        members: { data: { user_id: $userId, role: "owner" } }
      }) { id }
    }
  `;
  const org = await graphqlRequest(CREATE_ORG, { name: 'Execution Org', userId }, adminHeaders);
  const orgId = org.data?.insert_organizations_one?.id;
  console.log(`Org ID: ${orgId}`);

  // 2. Create Workflow
  const CREATE_WF = `
    mutation CreateWf($orgId: uuid!, $userId: uuid!) {
      insert_workflows_one(object: {
        org_id: $orgId, name: "Test Execution Wf", created_by: $userId,
        steps: {
          data: [
            { position: 1, type: "llm_call", config: { prompt: "Say hello", retries: 1 } },
            { position: 2, type: "conditional_branch", config: { condition: "context.step_1.toLowerCase().includes('hello')" } },
            { position: 3, type: "approval_gate", config: {} },
            { position: 4, type: "http_request", config: { url: "https://jsonplaceholder.typicode.com/todos/1" } }
          ]
        }
      }) { id, steps { id, type } }
    }
  `;
  const wf = await graphqlRequest(CREATE_WF, { orgId, userId }, adminHeaders);
  if (wf.errors) console.error('WF Create Error:', wf.errors);
  const wfId = wf.data?.insert_workflows_one?.id;
  console.log(`Workflow ID: ${wfId}`);

  // 3. Trigger Workflow Run via HTTP (simulating Hasura Action)
  console.log('\n--- Triggering Workflow ---');
  const triggerRes = await fetch('http://localhost:3001/triggerWorkflowRun', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: userId,
      workflow_id: wfId
    })
  });
  const triggerText = await triggerRes.text();
  console.log('Trigger Response:', triggerText);
  let triggerData;
  try { triggerData = JSON.parse(triggerText); } catch(e) { return console.error('Failed to parse trigger response'); }
  const runId = triggerData.workflow_run_id;

  if (!runId) return console.error("Failed to start run.");

  // 4. Wait for execution to hit approval gate
  console.log('\n--- Waiting for execution to hit approval gate (5s) ---');
  await new Promise(r => setTimeout(r, 5000));

  // 5. Query Run Status
  const GET_RUN = `
    query GetRun($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        status
        step_runs { id, status, workflow_step { type } }
      }
    }
  `;
  let runStatus = await graphqlRequest(GET_RUN, { id: runId }, adminHeaders);
  console.log('Run Status:', JSON.stringify(runStatus.data, null, 2));

  // Find the paused step_run
  const approvalStepRun = runStatus.data?.workflow_runs_by_pk?.step_runs?.find(s => s.status === 'paused');
  
  if (!approvalStepRun) {
    return console.error("Could not find a paused step run for the approval gate!");
  }

  console.log(`\nFound paused step_run: ${approvalStepRun.id}`);

  // 6. Approve Step via HTTP
  console.log('\n--- Approving Step ---');
  const approveRes = await fetch('http://localhost:3001/approveStep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: userId,
      step_run_id: approvalStepRun.id
    })
  });
  const approveText = await approveRes.text();
  console.log('Approve Response:', approveText);

  // 7. Wait for completion
  console.log('\n--- Waiting for completion (2s) ---');
  await new Promise(r => setTimeout(r, 2000));

  runStatus = await graphqlRequest(GET_RUN, { id: runId }, adminHeaders);
  console.log('Final Run Status:', JSON.stringify(runStatus.data, null, 2));
}

run().catch(console.error);
