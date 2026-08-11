const fs = require('fs');

fetch('http://localhost:8080/v1/metadata', {
  method: 'POST',
  headers: {
    'x-hasura-admin-secret': 'nhost-admin-secret',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ type: 'export_metadata', args: {} })
})
  .then(res => res.json())
  .then(data => {
    fs.writeFileSync('nhost_metadata_export.json', JSON.stringify(data, null, 2));
    console.log('Metadata exported successfully!');
  })
  .catch(err => {
    console.error('Error exporting metadata:', err);
  });
