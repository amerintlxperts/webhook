const http = require('http');
const { exec } = require('child_process');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      console.log('Received POST with body:', body);

      try {
        const data = JSON.parse(body);
        const eventMeta = data.eventmeta;

        if (eventMeta && eventMeta.kind === 'Ingress' && eventMeta.reason === 'Updated') {
          const namespace = eventMeta.namespace;
          const ingressName = eventMeta.name;

          // Construct the kubectl command
          const kubectlCommand = `kubectl get ingress ${ingressName} -n ${namespace} -o jsonpath='{.metadata.annotations}'`;

          console.log(`Executing command: ${kubectlCommand}`);

          exec(kubectlCommand, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error executing kubectl command: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`kubectl stderr: ${stderr}`);
              return;
            }
            console.log(`Ingress annotations: ${stdout}`);
          });
        }
      } catch (err) {
        console.error(`Failed to process webhook: ${err.message}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', received: body }));
    });
  } else {
    res.writeHead(405);
    res.end('Only POST allowed');
  }
});

server.listen(8080, () => {
  console.log('Webhook handler listening on port 8080');
});

