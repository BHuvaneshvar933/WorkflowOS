const http = require('http');

const adminSecret = 'nhost-admin-secret';
const graphqlUrl = 'http://subspace_assignment-graphql-1:8080/v1/graphql';

async function fetchGraphQL(query, variables, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(graphqlUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(data));
                }
            });
        });
        
        req.on('error', reject);
        req.write(JSON.stringify({ query, variables }));
        req.end();
    });
}

async function run() {
    try {
        // 1. Seed Data as Admin
        console.log("Seeding data...");
        const seedMutation = `
            mutation Seed {
                insert_auth_users(objects: [
                    { id: "user-a", email: "editor@orga.com" },
                    { id: "user-b", email: "owner@orgb.com" },
                    { id: "user-c", email: "viewer@orga.com" }
                ], on_conflict: { constraint: users_pkey, update_columns: [] }) { affected_rows }
                
                insert_organizations(objects: [
                    { 
                        id: "org-a", name: "Org A", 
                        members: { data: [
                            { user_id: "user-a", role: "editor" },
                            { user_id: "user-c", role: "viewer" }
                        ]}
                    },
                    { 
                        id: "org-b", name: "Org B",
                        members: { data: [
                            { user_id: "user-b", role: "owner" }
                        ]}
                    }
                ], on_conflict: { constraint: organizations_pkey, update_columns: [] }) { affected_rows }
                
                insert_workflows(objects: [
                    { id: "wf-a", org_id: "org-a", name: "Org A Workflow", description: "" },
                    { id: "wf-b", org_id: "org-b", name: "Org B Workflow", description: "" }
                ], on_conflict: { constraint: workflows_pkey, update_columns: [] }) { affected_rows }
            }
        `;
        await fetchGraphQL(seedMutation, {}, { 'X-Hasura-Admin-Secret': adminSecret });

        // 2. Test: Org A user -> Org A data, NOT Org B data
        console.log("\\n--- Testing Org A User (Editor) ---");
        const editorHeaders = { 'X-Hasura-Role': 'user', 'X-Hasura-User-Id': 'user-a' };
        
        const q1 = await fetchGraphQL(`query { workflows { id name } }`, {}, editorHeaders);
        console.log("Workflows visible to User A:", q1.data.workflows.map(w => w.name).join(", "));
        
        // 3. Test: Viewer -> read ✅, write ❌
        console.log("\\n--- Testing Org A Viewer ---");
        const viewerHeaders = { 'X-Hasura-Role': 'user', 'X-Hasura-User-Id': 'user-c' };
        
        const q2 = await fetchGraphQL(`query { workflows { id name } }`, {}, viewerHeaders);
        console.log("Workflows visible to User C (Viewer):", q2.data.workflows.map(w => w.name).join(", "));
        
        const q3 = await fetchGraphQL(`mutation { update_workflows(where: {id: {_eq: "wf-a"}}, _set: {name: "Hacked"}) { affected_rows } }`, {}, viewerHeaders);
        console.log("Viewer trying to update workflow:", q3.data.update_workflows.affected_rows === 0 ? "Blocked (affected 0 rows)" : "Failed: Allowed!");

        // 4. Test: Editor -> workflow edit ✅, member management ❌
        console.log("\\n--- Testing Org A Editor Mutations ---");
        const q4 = await fetchGraphQL(`mutation { update_workflows(where: {id: {_eq: "wf-a"}}, _set: {name: "Updated by Editor"}) { affected_rows } }`, {}, editorHeaders);
        console.log("Editor updating workflow:", q4.data.update_workflows.affected_rows === 1 ? "Success (affected 1 row)" : "Failed!");
        
        const q5 = await fetchGraphQL(`mutation { insert_org_members(objects: [{org_id: "org-a", user_id: "user-b", role: "viewer"}]) { affected_rows } }`, {}, editorHeaders);
        console.log("Editor trying to add member:", q5.errors ? "Blocked (" + q5.errors[0].message + ")" : "Failed: Allowed!");

    } catch (e) {
        console.error(e);
    }
}
run();
