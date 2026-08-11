export const ADMIN_HEADERS = {
  'x-hasura-admin-secret': process.env.HASURA_GRAPHQL_ADMIN_SECRET || 'nhost-admin-secret',
  'Content-Type': 'application/json'
};

const graphqlUrl = 'http://host.docker.internal:8080/v1/graphql';

export const nhost = {
  graphql: {
    request: async (query: string, variables: any, options: { headers: any }) => {
      const res = await fetch(graphqlUrl, {
        method: 'POST',
        headers: options.headers,
        body: JSON.stringify({ query, variables })
      });
      return await res.json();
    }
  }
};

// Types
export interface WorkflowStep {
  id: string;
  position: number;
  type: string;
  config: any;
}

export interface Workflow {
  id: string;
  org_id: string;
  name: string;
  steps: WorkflowStep[];
}

export async function fetchWorkflow(workflowId: string): Promise<Workflow | null> {
  const query = `
    query GetWorkflow($id: uuid!) {
      workflows_by_pk(id: $id) {
        id
        org_id
        name
        steps(order_by: {position: asc}) {
          id
          position
          type
          config
        }
      }
    }
  `;
  const res = await nhost.graphql.request(query, { id: workflowId }, { headers: ADMIN_HEADERS });
  return res.data?.workflows_by_pk || null;
}

export async function checkOrgMembership(userId: string, orgId: string): Promise<string | null> {
  const query = `
    query CheckMembership($userId: uuid!, $orgId: uuid!) {
      org_members(where: {user_id: {_eq: $userId}, org_id: {_eq: $orgId}}) {
        role
      }
    }
  `;
  const res = await nhost.graphql.request(query, { userId, orgId }, { headers: ADMIN_HEADERS });
  if (res.data?.org_members?.length > 0) {
    return res.data.org_members[0].role;
  }
  return null;
}

export async function createWorkflowRun(workflowId: string, userId: string): Promise<string> {
  const mutation = `
    mutation CreateRun($workflowId: uuid!, $userId: uuid!) {
      insert_workflow_runs_one(object: {
        workflow_id: $workflowId,
        triggered_by: $userId,
        trigger_type: "manual",
        status: "running"
      }) {
        id
      }
    }
  `;
  const res = await nhost.graphql.request(mutation, { workflowId, userId }, { headers: ADMIN_HEADERS });
  return res.data.insert_workflow_runs_one.id;
}

export async function checkQuota(orgId: string): Promise<boolean> {
  const query = `
    query GetOrgQuota($orgId: uuid!) {
      organizations_by_pk(id: $orgId) {
        usage_used
        usage_limit
      }
    }
  `;
  const res = await nhost.graphql.request(query, { orgId }, { headers: ADMIN_HEADERS });
  const org = res.data?.organizations_by_pk;
  if (!org) return false;
  return org.usage_used < org.usage_limit;
}

export async function incrementQuotaUsage(orgId: string): Promise<void> {
  const mutation = `
    mutation IncrementQuota($orgId: uuid!) {
      update_organizations_by_pk(pk_columns: {id: $orgId}, _inc: {usage_used: 1}) {
        id
      }
    }
  `;
  await nhost.graphql.request(mutation, { orgId }, { headers: ADMIN_HEADERS });
}
