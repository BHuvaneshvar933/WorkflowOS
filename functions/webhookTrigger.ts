import { Request, Response } from 'express';
import { nhost, ADMIN_HEADERS, fetchWorkflow, checkQuota, createWorkflowRun } from './_utils/graphql';
import { executeWorkflowRun } from './_utils/execution';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Extract payload (Hasura Action wraps inputs in `input`)
  const payload = req.body?.input || req.body;
  const triggerId = payload.trigger_id;

  if (!triggerId) {
    return res.status(400).json({ message: 'Bad Request: trigger_id is required' });
  }

  try {
    // 1. Fetch Trigger and verify it exists and is a webhook
    const getTriggerQuery = `
      query GetTrigger($id: uuid!) {
        workflow_triggers_by_pk(id: $id) {
          id
          workflow_id
          trigger_type
          enabled
        }
      }
    `;
    const triggerRes = await nhost.graphql.request(getTriggerQuery, { id: triggerId }, { headers: ADMIN_HEADERS });
    const trigger = triggerRes.data.workflow_triggers_by_pk;

    if (!trigger) {
      return res.status(404).json({ message: 'Trigger not found' });
    }
    if (trigger.trigger_type !== 'webhook') {
      return res.status(400).json({ message: 'Trigger is not a webhook' });
    }
    if (!trigger.enabled) {
      return res.status(400).json({ message: 'Trigger is disabled' });
    }

    // 2. Fetch Workflow
    const workflow = await fetchWorkflow(trigger.workflow_id);
    if (!workflow) {
      return res.status(404).json({ message: 'Workflow not found' });
    }

    // 3. Check Quota (No user auth check needed, the trigger UUID is the secret)
    const hasQuota = await checkQuota(workflow.org_id);
    if (!hasQuota) {
      return res.status(429).json({ message: 'Quota exceeded for this organization' });
    }

    // 4. Create Workflow Run
    const runId = await createWorkflowRun(workflow.id);

    // 5. Fire and Forget Execution
    // Pass the payload as initial context so steps can read webhook data
    executeWorkflowRun(runId, workflow, 0, { webhook_payload: payload.data || {} })
      .catch(err => {
        console.error(`[Execution Error run ${runId}]:`, err);
      });

    return res.status(200).json({ 
      id: runId, 
      status: 'started',
      message: 'Workflow execution started via webhook'
    });
  } catch (error: any) {
    console.error("Webhook trigger error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
