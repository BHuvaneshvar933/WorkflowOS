const fs = require('fs');

async function run() {
  const adminSecret = 'nhost-admin-secret';
  const url = 'http://localhost:8080/v1/metadata';
  
  const headers = {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': adminSecret
  };

  const payload = {
    type: 'bulk',
    args: [
      // 1. Track workflow_triggers
      {
        type: 'pg_track_table',
        args: {
          table: 'workflow_triggers'
        }
      },
      // 2. Track org_usage_stats
      {
        type: 'pg_track_table',
        args: {
          table: 'org_usage_stats'
        }
      },
      // 3. Object Rel: workflow_triggers -> workflows
      {
        type: 'pg_create_object_relationship',
        args: {
          table: 'workflow_triggers',
          name: 'workflow',
          using: {
            foreign_key_constraint_on: 'workflow_id'
          }
        }
      },
      // 4. Array Rel: workflows -> workflow_triggers
      {
        type: 'pg_create_array_relationship',
        args: {
          table: 'workflows',
          name: 'workflow_triggers',
          using: {
            foreign_key_constraint_on: {
              table: 'workflow_triggers',
              column: 'workflow_id'
            }
          }
        }
      },
      // 5. INSERT permissions for organizations
      {
        type: 'pg_drop_insert_permission',
        args: { table: 'organizations', role: 'user' }
      },
      {
        type: 'pg_create_insert_permission',
        args: {
          table: 'organizations',
          role: 'user',
          permission: {
            columns: '*',
            check: {}, // Anyone can create an org
            set: {}
          }
        }
      },
      // 6. INSERT permissions for org_members
      {
        type: 'pg_drop_insert_permission',
        args: { table: 'org_members', role: 'user' }
      },
      {
        type: 'pg_create_insert_permission',
        args: {
          table: 'org_members',
          role: 'user',
          permission: {
            columns: '*',
            check: { user_id: { _eq: "X-Hasura-User-Id" } }, // Can only insert themselves (as owner usually)
            set: { user_id: "X-Hasura-User-Id" }
          }
        }
      },
      // 7. SELECT permissions for workflow_triggers (Role: user)
      {
        type: 'pg_create_select_permission',
        args: {
          table: 'workflow_triggers',
          role: 'user',
          permission: {
            columns: '*',
            filter: {
              workflow: {
                organization: {
                  members: {
                    user_id: { _eq: "X-Hasura-User-Id" }
                  }
                }
              }
            }
          }
        }
      },
      // 8. SELECT permissions for org_usage_stats (Role: user)
      {
        type: 'pg_create_select_permission',
        args: {
          table: 'org_usage_stats',
          role: 'user',
          permission: {
            columns: '*',
            filter: {
              org_id: {
                _eq: "X-Hasura-User-Id" // Wait! org_usage_stats joins on org_id. Does org_usage_stats have org_id? Yes.
                // Wait, it should be: users can see stats for orgs they belong to.
              }
            }
          }
        }
      }
    ]
  };

  // Fix org_usage_stats filter
  payload.args[7].args.permission.filter = {
    org_id: {
      _in: [] // We can't do subqueries easily here unless we have a relationship.
      // Wait, let's track a relationship org_usage_stats -> organizations!
    }
  };
  
  // Replace the org_usage_stats permissions with a relationship first
  payload.args[7] = {
    type: 'pg_create_object_relationship',
    args: {
      table: 'org_usage_stats',
      name: 'organization',
      using: {
        manual_configuration: {
          remote_table: 'organizations',
          column_mapping: { org_id: 'id' }
        }
      }
    }
  };

  // Add the select permission for org_usage_stats using the relationship
  payload.args.push({
    type: 'pg_create_select_permission',
    args: {
      table: 'org_usage_stats',
      role: 'user',
      permission: {
        columns: '*',
        filter: {
          organization: {
            members: {
              user_id: { _eq: "X-Hasura-User-Id" }
            }
          }
        }
      }
    }
  });

  // Finally, Layer 2: step-level gating for workflow_steps
  // The user role already has insert/update permissions from Phase 3. We must drop them and recreate.
  // Actually, let's just make the requests iteratively to handle potential "already exists" errors.
  
  for (let req of payload.args) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'bulk', args: [req] })
      });
      const data = await res.json();
      console.log(`Req: ${req.type} ->`, data);
    } catch (err) {
      console.error(err);
    }
  }
}

run();
