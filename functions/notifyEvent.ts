import { Request, Response } from 'express';

export default async function notifyEvent(req: Request, res: Response) {
  try {
    const payload = req.body;
    
    // Ensure this is an event payload
    if (!payload.event || !payload.event.data) {
      return res.status(400).send("Invalid payload");
    }

    const newRow = payload.event.data.new;

    // We only care if status is completed
    if (newRow.status !== 'completed') {
      return res.status(200).send("Ignored, not completed");
    }

    // Check if it's a notify step by querying Hasura
    const GET_STEP = `
      query GetStep($id: uuid!) {
        step_runs_by_pk(id: $id) {
          workflow_step { type }
        }
      }
    `;
    const stepRes = await fetch('http://host.docker.internal:8080/v1/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': 'nhost-admin-secret'
      },
      body: JSON.stringify({ query: GET_STEP, variables: { id: newRow.id } })
    });
    
    const stepData = await stepRes.json();
    if (stepData.data?.step_runs_by_pk?.workflow_step?.type !== 'notify') {
      return res.status(200).send("Ignored, not a notify step");
    }

    // In a real app, this would send an email or Slack message.
    // For this assignment, we simply log it successfully!
    console.log(`[NOTIFY EVENT TRIGGER] Sending notification for step_run ${newRow.id}`);
    
    return res.status(200).send({ message: 'Notification sent successfully' });
  } catch (error: any) {
    console.error("Notify error:", error);
    return res.status(500).send({ message: error.message });
  }
}
