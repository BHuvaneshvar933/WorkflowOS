const fs = require('fs');

const commands = [
    // 1. Track Tables
    ...['organizations', 'org_members', 'workflows', 'workflow_steps', 'workflow_triggers', 'workflow_runs', 'step_runs'].map(table => ({
        type: 'pg_track_table',
        args: {
            table: { schema: 'public', name: table },
            source: 'default'
        }
    })),
    
    // 2. We don't need to track auth.users because Nhost already does it by default!
    
    // 3. Relationships for organizations
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'organizations' },
            name: 'members',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'org_members' }, column: 'org_id' } }
        }
    },
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'organizations' },
            name: 'workflows',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflows' }, column: 'org_id' } }
        }
    },
    
    // 4. Relationships for org_members
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'org_members' },
            name: 'organization',
            source: 'default',
            using: { foreign_key_constraint_on: 'org_id' }
        }
    },
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'org_members' },
            name: 'user',
            source: 'default',
            using: { manual_configuration: { remote_table: { schema: 'auth', name: 'users' }, column_mapping: { user_id: 'id' } } }
        }
    },
    
    // 5. Relationships for workflows
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'workflows' },
            name: 'organization',
            source: 'default',
            using: { foreign_key_constraint_on: 'org_id' }
        }
    },
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'workflows' },
            name: 'steps',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_steps' }, column: 'workflow_id' } }
        }
    },
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'workflows' },
            name: 'triggers',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_triggers' }, column: 'workflow_id' } }
        }
    },
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'workflows' },
            name: 'runs',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'workflow_runs' }, column: 'workflow_id' } }
        }
    },

    // 6. Relationships for workflow_steps
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'workflow_steps' },
            name: 'workflow',
            source: 'default',
            using: { foreign_key_constraint_on: 'workflow_id' }
        }
    },
    
    // 7. Relationships for workflow_triggers
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'workflow_triggers' },
            name: 'workflow',
            source: 'default',
            using: { foreign_key_constraint_on: 'workflow_id' }
        }
    },
    
    // 8. Relationships for workflow_runs
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'workflow_runs' },
            name: 'workflow',
            source: 'default',
            using: { foreign_key_constraint_on: 'workflow_id' }
        }
    },
    {
        type: 'pg_create_array_relationship',
        args: {
            table: { schema: 'public', name: 'workflow_runs' },
            name: 'step_runs',
            source: 'default',
            using: { foreign_key_constraint_on: { table: { schema: 'public', name: 'step_runs' }, column: 'workflow_run_id' } }
        }
    },
    
    // 9. Relationships for step_runs
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'step_runs' },
            name: 'workflow_run',
            source: 'default',
            using: { foreign_key_constraint_on: 'workflow_run_id' }
        }
    },
    {
        type: 'pg_create_object_relationship',
        args: {
            table: { schema: 'public', name: 'step_runs' },
            name: 'workflow_step',
            source: 'default',
            using: { foreign_key_constraint_on: 'workflow_step_id' }
        }
    },
    
    // 10. Permissions: User Role
    
    // organizations
    {
        type: 'pg_create_select_permission',
        args: {
            table: { schema: 'public', name: 'organizations' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                filter: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } }
            }
        }
    },
    {
        type: 'pg_create_update_permission',
        args: {
            table: { schema: 'public', name: 'organizations' },
            role: 'user',
            source: 'default',
            permission: {
                columns: ['name'],
                filter: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _eq: 'owner' } } },
                check: null
            }
        }
    },
    
    // org_members
    {
        type: 'pg_create_select_permission',
        args: {
            table: { schema: 'public', name: 'org_members' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
            }
        }
    },
    {
        type: 'pg_create_insert_permission',
        args: {
            table: { schema: 'public', name: 'org_members' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                check: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _eq: 'owner' } } } }
            }
        }
    },
    {
        type: 'pg_create_update_permission',
        args: {
            table: { schema: 'public', name: 'org_members' },
            role: 'user',
            source: 'default',
            permission: {
                columns: ['role'],
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _eq: 'owner' } } } },
                check: null
            }
        }
    },
    {
        type: 'pg_create_delete_permission',
        args: {
            table: { schema: 'public', name: 'org_members' },
            role: 'user',
            source: 'default',
            permission: {
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _eq: 'owner' } } } }
            }
        }
    },
    
    // workflows
    {
        type: 'pg_create_select_permission',
        args: {
            table: { schema: 'public', name: 'workflows' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } }
            }
        }
    },
    {
        type: 'pg_create_insert_permission',
        args: {
            table: { schema: 'public', name: 'workflows' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                check: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } }
            }
        }
    },
    {
        type: 'pg_create_update_permission',
        args: {
            table: { schema: 'public', name: 'workflows' },
            role: 'user',
            source: 'default',
            permission: {
                columns: ['name', 'description', 'status'],
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } },
                check: null
            }
        }
    },
    {
        type: 'pg_create_delete_permission',
        args: {
            table: { schema: 'public', name: 'workflows' },
            role: 'user',
            source: 'default',
            permission: {
                filter: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } }
            }
        }
    },
    
    // workflow_steps
    {
        type: 'pg_create_select_permission',
        args: {
            table: { schema: 'public', name: 'workflow_steps' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                filter: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } }
            }
        }
    },
    {
        type: 'pg_create_insert_permission',
        args: {
            table: { schema: 'public', name: 'workflow_steps' },
            role: 'user',
            source: 'default',
            permission: {
                columns: '*',
                check: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } } }
            }
        }
    },
    {
        type: 'pg_create_update_permission',
        args: {
            table: { schema: 'public', name: 'workflow_steps' },
            role: 'user',
            source: 'default',
            permission: {
                columns: ['position', 'type', 'config'],
                filter: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } } },
                check: null
            }
        }
    },
    {
        type: 'pg_create_delete_permission',
        args: {
            table: { schema: 'public', name: 'workflow_steps' },
            role: 'user',
            source: 'default',
            permission: {
                filter: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } } }
            }
        }
    }
];

const extraPermissions = ['workflow_triggers', 'workflow_runs', 'step_runs'].flatMap(table => {
    let parentRel = 'workflow';
    if (table === 'step_runs') parentRel = 'workflow_run';
    
    const filter = table === 'step_runs' ? 
        { workflow_run: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } } } :
        { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' } } } } };
    
    const check = table === 'step_runs' ? 
        { workflow_run: { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } } } } :
        { workflow: { organization: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, role: { _in: ['owner', 'editor'] } } } } };

    return [
        {
            type: 'pg_create_select_permission',
            args: {
                table: { schema: 'public', name: table },
                role: 'user',
                source: 'default',
                permission: { columns: '*', filter }
            }
        },
        {
            type: 'pg_create_insert_permission',
            args: {
                table: { schema: 'public', name: table },
                role: 'user',
                source: 'default',
                permission: { columns: '*', check }
            }
        },
        {
            type: 'pg_create_update_permission',
            args: {
                table: { schema: 'public', name: table },
                role: 'user',
                source: 'default',
                permission: { columns: '*', filter: check, check: null }
            }
        },
        {
            type: 'pg_create_delete_permission',
            args: {
                table: { schema: 'public', name: table },
                role: 'user',
                source: 'default',
                permission: { filter: check }
            }
        }
    ];
});

const payload = {
    type: 'bulk',
    args: [...commands, ...extraPermissions]
};

fs.writeFileSync('metadata.json', JSON.stringify(payload, null, 2));
console.log('Wrote metadata.json');
