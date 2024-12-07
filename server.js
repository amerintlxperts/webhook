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

          // Construct the kubectl command to get annotations
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

            // Parse annotations JSON
            const annotations = JSON.parse(stdout);
            const certGroup = annotations["server-policy-intermediate-certificate-group"];
            const fortiwebIP = annotations["fortiweb-ip"];
            const fortiwebPort = annotations["fortiweb-port"];

            if (!certGroup || !fortiwebIP || !fortiwebPort) {
              console.error("Missing required annotations.");
              return;
            }

            console.log(`Annotations found: certGroup=${certGroup}, fortiwebIP=${fortiwebIP}, fortiwebPort=${fortiwebPort}`);

            // Retrieve username and password from the secret
            const getSecretCommand = `kubectl get secret ${annotations["fortiweb-login"]} -o jsonpath="{.data}"`;
            exec(getSecretCommand, (secretError, secretStdout, secretStderr) => {
              if (secretError) {
                console.error(`Error fetching secret: ${secretError.message}`);
                return;
              }
              if (secretStderr) {
                console.error(`kubectl stderr: ${secretStderr}`);
                return;
              }

              const secretData = JSON.parse(secretStdout);
              const username = Buffer.from(secretData.username, 'base64').toString('utf-8');
              const password = Buffer.from(secretData.password, 'base64').toString('utf-8');

              if (!username || !password) {
                console.error("Error: Could not retrieve username or password from the secret.");
                return;
              }

              console.log(`Retrieved username and password successfully.`);

              // Create the token
              const token = Buffer.from(JSON.stringify({ username, password, vdom: "root" })).toString('base64');

              // Execute the curl command
              const curlCommand = `
                curl 'https://${fortiwebIP}:${fortiwebPort}/api/v2.0/cmdb/server-policy/policy?mkey=${ingressName}_${namespace}' \
                --insecure \
                -H "Authorization:${token}" \
                -k \
                -X 'PUT' \
                -H 'Content-Type: application/json;charset=utf-8' \
                -H 'Accept: application/json, text/plain, */*' \
                --data-binary '{"data":{"intermediate-certificate-group":"${certGroup}"}}'`;

              console.log(`Executing curl command: ${curlCommand}`);

              exec(curlCommand, (curlError, curlStdout, curlStderr) => {
                if (curlError) {
                  console.error(`Error executing curl command: ${curlError.message}`);
                  return;
                }
                if (curlStderr) {
                  console.error(`curl stderr: ${curlStderr}`);
                  return;
                }
                console.log(`Curl command output: ${curlStdout}`);
              });
            });
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

