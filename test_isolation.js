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
  console.log('Testing Organization Isolation for Subscriptions and Actions...');

  const adminHeaders = { 'x-hasura-admin-secret': 'nhost-admin-secret' };
  
  const userA_id = 'aaaaa111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userB_id = 'bbbbb222-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  // 1. Create Orgs
  const CREATE_ORG = `
    mutation CreateOrg($name: String!, $userId: uuid!) {
      insert_organizations_one(object: {
        name: $name,
        members: { data: { user_id: $userId, role: "owner" } }
      }) { id }
    }
  `;
  const orgA = await graphqlRequest(CREATE_ORG, { name: 'Org A', userId: userA_id }, adminHeaders);
  const orgB = await graphqlRequest(CREATE_ORG, { name: 'Org B', userId: userB_id }, adminHeaders);
  const orgA_id = orgA.data.insert_organizations_one.id;
  
  // 2. Create Workflow in Org A
  const CREATE_WF = `
    mutation CreateWf($orgId: uuid!, $userId: uuid!) {
      insert_workflows_one(object: {
        org_id: $orgId, name: "Test Execution Wf", created_by: $userId,
        steps: {
          data: [
            { position: 1, type: "approval_gate", config: {} }
          ]
        }
      }) { id }
    }
  `;
  const wf = await graphqlRequest(CREATE_WF, { orgId: orgA_id, userId: userA_id }, adminHeaders);
  const wfId = wf.data.insert_workflows_one.id;

  // 3. Trigger Workflow via User A using Hasura Action
  console.log('\n--- User A triggering workflow via Hasura Action ---');
  const TRIGGER_ACTION = `
    mutation TriggerWf($wfId: uuid!) {
      triggerWorkflowRun(workflow_id: $wfId) {
        success
        workflow_run_id
        message
      }
    }
  `;
  const triggerRes = await graphqlRequest(TRIGGER_ACTION, { wfId }, { 
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'x-hasura-role': 'user', 
    'x-hasura-user-id': userA_id 
  });
  console.log('Action Output:', triggerRes);
  const runId = triggerRes.data?.triggerWorkflowRun?.workflow_run_id;

  if (!runId) return console.error('Failed to trigger workflow');

  // Wait briefly for step_run to be created
  await new Promise(r => setTimeout(r, 1000));

  // Get the step_run_id using admin headers
  const GET_RUN = `
    query GetRun($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        step_runs { id }
      }
    }
  `;
  const runStatus = await graphqlRequest(GET_RUN, { id: runId }, adminHeaders);
  const stepRunId = runStatus.data?.workflow_runs_by_pk?.step_runs[0]?.id;
  
  if (!stepRunId) return console.error('Failed to find step run');

  // 4. Test Isolation: User B tries to SELECT User A's workflow_run
  console.log('\n--- User B attempting to read User A workflow_run (ID Guessing) ---');
  const readRes = await graphqlRequest(GET_RUN, { id: runId }, { 
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'x-hasura-role': 'user', 
    'x-hasura-user-id': userB_id 
  });
  
  if (readRes.data?.workflow_runs_by_pk === null) {
    console.log('✅ Isolation test passed: User B cannot read workflow_runs_by_pk');
  } else {
    console.error('❌ Isolation test failed: User B read workflow_runs_by_pk!', readRes.data);
  }

  // 5. Test Isolation: User B tries to approve User A's step via Action
  console.log('\n--- User B attempting to approve User A step (ID Guessing via Action) ---');
  const APPROVE_ACTION = `
    mutation ApproveStep($stepRunId: uuid!) {
      approveStep(step_run_id: $stepRunId) {
        success
        message
      }
    }
  `;
  const approveRes = await graphqlRequest(APPROVE_ACTION, { stepRunId }, { 
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'x-hasura-role': 'user', 
    'x-hasura-user-id': userB_id 
  });
  
  // Since the endpoint responds with 403 HTTP status, Hasura translates it to an error
  if (approveRes.errors) {
    console.log('✅ Action Isolation test passed: User B was rejected.');
    console.log('Error message from Hasura Action:', approveRes.errors[0].message);
  } else {
    console.error('❌ Action Isolation test failed: User B was able to approve!', approveRes.data);
  }
}

run().catch(console.error);
