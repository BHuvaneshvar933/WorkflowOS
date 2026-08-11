import { Request, Response } from 'express';
import { fetchWorkflow, checkOrgMembership, createWorkflowRun, checkQuota } from './_utils/graphql';
import { executeWorkflowRun } from './_utils/execution';

export default async function handler(req: Request, res: Response) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // 1. Authenticate Caller
  // Nhost functions receive auth headers from the client/gateway.
  // In a Hasura Action, the body contains session variables inside `session_variables`.
  // If called directly via Nhost Functions, we extract from req.headers.
  
  // Let's support both direct call and Hasura Action call.
  let userId = '';
  const hasuraSession = req.body?.session_variables;
  
  if (hasuraSession && hasuraSession['x-hasura-user-id']) {
    userId = hasuraSession['x-hasura-user-id'];
  } else if (req.headers['x-hasura-user-id']) {
    userId = req.headers['x-hasura-user-id'] as string;
  } else {
    // For local dev bypassing gateway, we might pass userId in body for easy testing
    userId = req.body?.userId || req.body?.input?.userId; 
  }

  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized: No user ID found in session' });
  }

  // Extract payload (Hasura Action wraps inputs in `input`)
  const payload = req.body?.input || req.body;
  const workflowId = payload.workflow_id;

  if (!workflowId) {
    return res.status(400).json({ message: 'Bad Request: workflow_id is required' });
  }

  try {
    // 2. Fetch Workflow & Verify Ownership
    const workflow = await fetchWorkflow(workflowId);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }

    // 3. Verify Org Membership (Server-Side Derivation)
    const role = await checkOrgMembership(userId, workflow.org_id);
    if (!role) {
      return res.status(403).json({ message: 'Forbidden: You are not a member of the organization that owns this workflow' });
    }

    // 3.5 Check Quota
    const hasQuota = await checkQuota(workflow.org_id);
    if (!hasQuota) {
      return res.status(429).json({ message: 'Quota exceeded for this organization' });
    }

    // 4. Create Workflow Run
    const runId = await createWorkflowRun(workflowId, userId);

    // 5. Hand off to Core Execution Loop (Run asynchronously)
    // We don't await this so the HTTP request returns immediately.
    executeWorkflowRun(runId, workflow).catch(err => {
      console.error(`Execution failed for run ${runId}:`, err);
    });

    return res.status(200).json({
      success: true,
      workflow_run_id: runId,
      message: 'Workflow execution started'
    });

  } catch (error: any) {
    console.error('Trigger Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
