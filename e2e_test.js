async function testE2E() {
  console.log("🚀 Starting E2E Architecture Test...");

  const userId = "55555555-5555-5555-5555-555555555555";
  const graphqlUrl = 'http://localhost:8080/v1/graphql';
  
  // Fake user token by using admin secret but acting as 'user' role with x-hasura-user-id
  const userHeaders = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'x-hasura-role': 'user',
    'x-hasura-user-id': userId
  };

  // 1. Create Org
  console.log("1. Creating Organization...");
  const createOrgReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        mutation CreateOrg {
          insert_organizations_one(object: {
            name: "Test Org",
            members: { data: { role: "owner" } }
          }) { id }
        }
      `
    })
  });
  const orgData = await createOrgReq.json();
  if (orgData.errors) {
    console.error("❌ Failed to create org:", orgData.errors);
    return;
  }
  const orgId = orgData.data.insert_organizations_one.id;
  console.log("✅ Created Org:", orgId);

  // 2. Create Workflow with multiple steps
  console.log("2. Creating Workflow...");
  const createWfReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        mutation CreateWorkflow($orgId: uuid!, $userId: uuid!) {
          insert_workflows_one(object: {
            name: "Test Workflow",
            description: "E2E test",
            org_id: $orgId,
            created_by: $userId,
            steps: {
              data: [
                { position: 1, type: "approval_gate", config: {} },
                { position: 2, type: "notify", config: {} }
              ]
            }
          }) { id }
        }
      `,
      variables: { orgId, userId }
    })
  });
  const wfData = await createWfReq.json();
  if (wfData.errors) {
    console.error("❌ Failed to create workflow:", wfData.errors);
    return;
  }
  const workflowId = wfData.data.insert_workflows_one.id;
  console.log("✅ Created Workflow:", workflowId);

  // 3. Trigger Workflow Run
  console.log("3. Triggering Workflow Run...");
  const triggerReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        mutation Trigger($wfId: uuid!) {
          triggerWorkflowRun(workflow_id: $wfId) {
            success
            workflow_run_id
          }
        }
      `,
      variables: { wfId: workflowId }
    })
  });
  const triggerData = await triggerReq.json();
  if (triggerData.errors || !triggerData.data.triggerWorkflowRun.success) {
    console.error("❌ Failed to trigger workflow:", triggerData);
    return;
  }
  const runId = triggerData.data.triggerWorkflowRun.workflow_run_id;
  console.log("✅ Triggered Run:", runId);

  // Wait a moment for execution engine to process
  await new Promise(r => setTimeout(r, 2000));

  // 4. Check Step Status (Should be paused at step 1)
  console.log("4. Checking Step Status...");
  const checkStepsReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        query GetSteps($runId: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { workflow_step: { position: asc } }) {
            id
            status
            workflow_step { type position }
          }
        }
      `,
      variables: { runId }
    })
  });
  const stepsData = await checkStepsReq.json();
  const stepRuns = stepsData.data.step_runs;
  console.log("Step Runs:", JSON.stringify(stepRuns, null, 2));
  
  if (stepRuns[0].status !== 'paused') {
    console.error("❌ Step 1 should be paused, but is:", stepRuns[0].status);
    return;
  }
  console.log("✅ Step 1 is paused correctly.");

  // 5. Approve Step
  console.log("5. Approving Step...");
  const approveReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        mutation Approve($stepRunId: uuid!) {
          approveStep(step_run_id: $stepRunId) {
            success
          }
        }
      `,
      variables: { stepRunId: stepRuns[0].id }
    })
  });
  const approveData = await approveReq.json();
  console.log("Approve Response:", approveData);

  // Wait a moment for execution engine to process the next step (notify)
  await new Promise(r => setTimeout(r, 2000));

  // 6. Check Final Status
  console.log("6. Checking Final Status...");
  const finalCheckReq = await fetch(graphqlUrl, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({
      query: `
        query GetSteps($runId: uuid!) {
          step_runs(where: { workflow_run_id: { _eq: $runId } }, order_by: { workflow_step: { position: asc } }) {
            status
            workflow_step { type position }
          }
        }
      `,
      variables: { runId }
    })
  });
  const finalData = await finalCheckReq.json();
  console.log("Final Step Runs:", JSON.stringify(finalData.data.step_runs, null, 2));

  console.log("🎉 E2E Test Completed Successfully!");
}

testE2E();
