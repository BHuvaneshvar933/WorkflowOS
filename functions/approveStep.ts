import { Request, Response } from 'express';
import { nhost, ADMIN_HEADERS, fetchWorkflow, checkOrgMembership } from './_utils/graphql';
import { executeWorkflowRun } from './_utils/execution';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Authenticate Caller
  let userId = '';
  const hasuraSession = req.body?.session_variables;
  if (hasuraSession && hasuraSession['x-hasura-user-id']) {
    userId = hasuraSession['x-hasura-user-id'];
  } else if (req.headers['x-hasura-user-id']) {
    userId = req.headers['x-hasura-user-id'] as string;
  } else {
    userId = req.body?.userId || req.body?.input?.userId; 
  }

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: No user ID found in session' });
  }

  const payload = req.body?.input || req.body;
  const stepRunId = payload.step_run_id;

  if (!stepRunId) {
    return res.status(400).json({ message: 'Bad Request: step_run_id is required' });
  }

  try {
    // 2. Fetch the Step Run & associated Workflow Run
    const stepQuery = `
      query GetStepRun($id: uuid!) {
        step_runs_by_pk(id: $id) {
          id
          status
          workflow_step_id
          workflow_run_id
          workflow_run {
            id
            workflow_id
          }
        }
      }
    `;
    const stepRes = await nhost.graphql.request(stepQuery, { id: stepRunId }, { headers: ADMIN_HEADERS });
    const stepRun = stepRes.data?.step_runs_by_pk;

    if (!stepRun) {
      return res.status(404).json({ message: 'Step Run not found' });
    }
    
    if (stepRun.status !== 'paused') {
      return res.status(400).json({ message: 'Step Run is not in paused state' });
    }

    const workflowId = stepRun.workflow_run.workflow_id;
    const runId = stepRun.workflow_run.id;

    // 3. Verify Org Membership
    const workflow = await fetchWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ message: 'Associated workflow not found' });
    }

    const role = await checkOrgMembership(userId, workflow.org_id);
    if (!role) {
      return res.status(403).json({ message: 'Forbidden: You are not a member of the organization that owns this workflow' });
    }

    // 4. Update Step Run Status to Approved
    const updateMutation = `
      mutation ApproveStepRun($id: uuid!, $userId: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {
          status: "completed",
          approved_by: $userId,
          approved_at: "now()",
          completed_at: "now()"
        }) {
          id
        }
        update_workflow_runs_by_pk(pk_columns: {id: "${runId}"}, _set: {
          status: "running"
        }) {
          id
        }
      }
    `;
    await nhost.graphql.request(updateMutation, { id: stepRunId, userId }, { headers: ADMIN_HEADERS });

    // 5. Resume execution starting from the NEXT step
    const pausedStepIndex = workflow.steps.findIndex(s => s.id === stepRun.workflow_step_id);
    
    if (pausedStepIndex !== -1 && pausedStepIndex < workflow.steps.length - 1) {
      // Resume asynchronously
      executeWorkflowRun(runId, workflow, pausedStepIndex + 1).catch(err => {
        console.error(`Resuming execution failed for run ${runId}:`, err);
      });
    } else {
      // It was the last step, mark run as completed
      const completeRunMutation = `
        mutation CompleteRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {
            status: "completed",
            completed_at: "now()"
          }) {
            id
          }
        }
      `;
      await nhost.graphql.request(completeRunMutation, { id: runId }, { headers: ADMIN_HEADERS });
    }

    return res.status(200).json({
      success: true,
      message: 'Step approved and execution resumed'
    });

  } catch (error: any) {
    console.error('Approval Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
