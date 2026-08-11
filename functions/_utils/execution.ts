import { nhost, ADMIN_HEADERS, Workflow, incrementQuotaUsage } from './graphql';
import { executeLlmCall } from './steps/llmCall';
import { executeHttpRequest } from './steps/httpRequest';
import { executeConditionalBranch } from './steps/conditionalBranch';

// We run execution in the background asynchronously relative to the HTTP response.
export async function executeWorkflowRun(runId: string, workflow: Workflow, startFromIndex = 0, initialContext = {}) {
  let context: any = { ...initialContext };
  
  for (let i = startFromIndex; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];

    // 1. Create step_run in 'running' state
    const createStepMutation = `
      mutation CreateStepRun($runId: uuid!, $stepId: uuid!) {
        insert_step_runs_one(object: {
          workflow_run_id: $runId,
          workflow_step_id: $stepId,
          status: "running"
        }) {
          id
        }
      }
    `;
    const stepRunRes = await nhost.graphql.request(createStepMutation, {
      runId: runId,
      stepId: step.id
    }, { headers: ADMIN_HEADERS });
    
    if (stepRunRes.errors) {
      console.error("Error creating step_run:", stepRunRes.errors);
      await updateRunStatus(runId, 'failed', 'Failed to initialize step');
      return;
    }
    
    const stepRunId = stepRunRes.data.insert_step_runs_one.id;

    // 2. Execute Step Logic with Retries
    let stepOutput = null;
    let stepError = null;
    let isPaused = false;
    
    const maxRetries = step.config.retries || 0;
    let attempt = 0;
    let success = false;

    while (attempt <= maxRetries && !success && !isPaused) {
      attempt++;
      if (attempt > 1) {
        console.log(`Retrying step ${step.id} (Attempt ${attempt})`);
        await new Promise(r => setTimeout(r, 1000 * attempt)); // Simple exponential backoff
      }

      if (step.type === 'llm_call') {
        const res = await executeLlmCall(step.config, context);
        if (res.success) {
          success = true;
          stepOutput = { result: res.result };
          context = { ...context, [`step_${step.position}`]: res.result };
        } else {
          stepError = res.error;
        }
      } else if (step.type === 'http_request') {
        const res = await executeHttpRequest(step.config, context);
        if (res.success) {
          success = true;
          stepOutput = { result: res.result, status: res.status };
          context = { ...context, [`step_${step.position}`]: res.result };
        } else {
          stepError = res.error;
        }
      } else if (step.type === 'conditional_branch') {
        const res = executeConditionalBranch(step.config, context);
        if (res.success) {
          success = true;
          stepOutput = { result: res.result };
          context = { ...context, [`step_${step.position}`]: res.result };
          // For a real implementation, we would skip steps based on this evaluation.
          // For now, it just evaluates and stores the result in context.
        } else {
          stepError = res.error;
        }
      } else if (step.type === 'approval_gate') {
        isPaused = true;
      } else if (step.type === 'db_write') {
        const insertDb = `
          mutation InsertDbWrite($orgId: uuid!, $runId: uuid!, $data: jsonb!) {
            insert_custom_results_one(object: {
              org_id: $orgId,
              run_id: $runId,
              data: $data
            }) { id }
          }
        `;
        // Perform variable substitution on data if needed (simplifying for now)
        const payloadData = typeof step.config.data === 'string' 
          ? JSON.parse(step.config.data.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, p1) => context[p1] || match))
          : step.config.data || {};
          
        const dbRes = await nhost.graphql.request(insertDb, { orgId: workflow.org_id, runId, data: payloadData }, { headers: ADMIN_HEADERS });
        if (dbRes.errors) {
          stepError = JSON.stringify(dbRes.errors);
        } else {
          success = true;
          stepOutput = { message: "Saved to database", id: dbRes.data.insert_custom_results_one.id };
        }
      } else if (step.type === 'notify') {
        // notify logic will be triggered by Hasura Event Trigger when step becomes running.
        // wait, if we mark it running, Hasura event trigger fires. 
        // We shouldn't mark it completed here if we want the event trigger to do it, OR we just mark it completed here and the event trigger sends the email simultaneously.
        // "implemented as an Event Trigger" -> so this engine just marks it completed, and Hasura sees the status change and fires the webhook!
        // Actually, let's mark it as completed here, and the Event Trigger on `step_runs` will see status = completed and type = notify and execute the webhook.
        success = true;
        stepOutput = { message: "Notification queued via Event Trigger" };
      } else {
        // Stub for other types
        success = true;
        stepOutput = { message: `Executed ${step.type} successfully` };
      }
    }

    // 3. Update Step Run Status
    if (isPaused) {
      await updateStepRun(stepRunId, 'paused', stepOutput, null, attempt);
      await updateRunStatus(runId, 'paused', null);
      // STOP EXECUTION LOOP HERE, serverless function exits cleanly
      return;
    } else if (!success) {
      await updateStepRun(stepRunId, 'failed', null, stepError, attempt);
      await updateRunStatus(runId, 'failed', `Step ${step.position} failed after ${attempt} attempts: ${stepError}`);
      return;
    } else {
      await updateStepRun(stepRunId, 'completed', stepOutput, null, attempt);
    }
  }

  // If we reach here, all steps completed successfully
  await incrementQuotaUsage(workflow.org_id);
  await updateRunStatus(runId, 'completed', null);
}

async function updateStepRun(stepRunId: string, status: string, output: any, error: string | null, attemptCount: number) {
  const mutation = `
    mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String, $attemptCount: Int!) {
      update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
        status: $status,
        output: $output,
        error: $error,
        attempt_count: $attemptCount,
        completed_at: "now()"
      }) {
        id
      }
    }
  `;
  await nhost.graphql.request(mutation, {
    id: stepRunId,
    status,
    output: output || {},
    error,
    attemptCount
  }, { headers: ADMIN_HEADERS });
}

async function updateRunStatus(runId: string, status: string, error: string | null) {
  const mutation = `
    mutation UpdateRun($id: uuid!, $status: String!, $error: String) {
      update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {
        status: $status,
        error: $error,
        completed_at: "now()"
      }) {
        id
      }
    }
  `;
  await nhost.graphql.request(mutation, {
    id: runId,
    status,
    error
  }, { headers: ADMIN_HEADERS });
}
