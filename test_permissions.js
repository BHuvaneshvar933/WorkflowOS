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
  console.log('Testing Phase 3 Permissions Rigorously via Hasura Impersonation...');

  const adminHeaders = { 'x-hasura-admin-secret': 'nhost-admin-secret' };

  // Create Users A and B manually via admin in auth schema or just use arbitrary UUIDs!
  // Wait, the org_members foreign key might require actual auth.users if there is an FK constraint.
  // We can just create arbitrary UUIDs, and if there's no FK, it works. Let's try!
  
  const userA_id = '11111111-1111-1111-1111-111111111111';
  const userB_id = '22222222-2222-2222-2222-222222222222';

  // 1. Create Org A and Org B
  const CREATE_ORG = `
    mutation CreateOrgAndMember($name: String!, $userId: uuid!) {
      insert_organizations_one(object: {
        name: $name,
        members: {
          data: {
            user_id: $userId,
            role: "owner"
          }
        }
      }) {
        id
      }
    }
  `;

  const orgA = await graphqlRequest(CREATE_ORG, { name: 'Org A', userId: userA_id }, adminHeaders);
  if (orgA.errors) console.error('Error creating Org A:', orgA.errors);
  const orgA_id = orgA.data?.insert_organizations_one?.id;
  
  const orgB = await graphqlRequest(CREATE_ORG, { name: 'Org B', userId: userB_id }, adminHeaders);
  if (orgB.errors) console.error('Error creating Org B:', orgB.errors);
  const orgB_id = orgB.data?.insert_organizations_one?.id;

  console.log(`Org A ID: ${orgA_id}`);
  console.log(`Org B ID: ${orgB_id}`);

  // 2. Create Workflow in Org B
  const CREATE_WORKFLOW = `
    mutation CreateWorkflow($orgId: uuid!, $userId: uuid!) {
      insert_workflows_one(object: {
        org_id: $orgId,
        name: "Secret Org B Workflow",
        description: "User A should not see this",
        created_by: $userId
      }) {
        id
      }
    }
  `;
  const wfB = await graphqlRequest(CREATE_WORKFLOW, { orgId: orgB_id, userId: userB_id }, adminHeaders);
  if (wfB.errors) console.error('Error creating Workflow B:', wfB.errors);
  const wfB_id = wfB.data?.insert_workflows_one?.id;
  console.log(`Workflow B ID: ${wfB_id}`);

  // 3. Create Workflow Step in Workflow B
  const CREATE_STEP = `
    mutation CreateStep($workflowId: uuid!) {
      insert_workflow_steps_one(object: {
        workflow_id: $workflowId,
        type: "llm_call",
        position: 1
      }) {
        id
      }
    }
  `;
  const stepB = await graphqlRequest(CREATE_STEP, { workflowId: wfB_id }, adminHeaders);
  if (stepB.errors) console.error('Error creating Step B:', stepB.errors);
  const stepB_id = stepB.data?.insert_workflow_steps_one?.id;
  console.log(`Workflow Step B ID: ${stepB_id}`);

  // 4. Test 1: User A tries to query Workflow B
  console.log('\n--- Test 1: User A accessing Org B Workflow ---');
  const GET_WORKFLOW = `
    query GetWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        name
      }
    }
  `;
  
  const userAHeaders = {
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'x-hasura-role': 'user',
    'x-hasura-user-id': userA_id
  };

  const fetchAsUserA = await graphqlRequest(GET_WORKFLOW, { id: wfB_id }, userAHeaders);
  if (fetchAsUserA.data && fetchAsUserA.data.workflows_by_pk === null) {
    console.log('✅ TEST PASSED: User A cannot read Org B Workflow.');
  } else {
    console.log('❌ TEST FAILED: User A read Org B Workflow!');
  }

  // 5. Test 2: User A tries to query Workflow Step B
  console.log('\n--- Test 2: User A accessing Org B Workflow Step ---');
  const GET_STEP = `
    query GetStep($id: uuid!) {
      workflow_steps_by_pk(id: $id) {
        id
        position
      }
    }
  `;
  const fetchStepAsUserA = await graphqlRequest(GET_STEP, { id: stepB_id }, userAHeaders);
  if (fetchStepAsUserA.data && fetchStepAsUserA.data.workflow_steps_by_pk === null) {
    console.log('✅ TEST PASSED: User A cannot read Org B Workflow Step.');
  } else {
    console.log('❌ TEST FAILED: User A read Org B Workflow Step!');
  }

}

run().catch(console.error);
