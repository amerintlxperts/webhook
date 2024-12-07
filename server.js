const http = require('http');
const { exec } = require('child_process');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      console.log('Received POST with body:', body);

      try {
        const data = JSON.parse(body);
        const { eventmeta } = data;

        if (eventmeta?.kind === 'Ingress' && eventmeta.reason === 'Updated') {
          const { namespace, name: ingressName } = eventmeta;

          const kubectlCommand = `kubectl get ingress ${ingressName} -n ${namespace} -o jsonpath='{.metadata.annotations}'`;

          console.log(`Executing command: ${kubectlCommand}`);
          exec(kubectlCommand, (kubectlError, kubectlStdout, kubectlStderr) => {
            if (kubectlError) {
              console.error(`Error executing kubectl command: ${kubectlError.message}`);
              return;
            }
            if (kubectlStderr) {
              console.error(`kubectl stderr: ${kubectlStderr}`);
              return;
            }

            try {
              const annotations = JSON.parse(kubectlStdout);
              const certGroup = annotations["server-policy-intermediate-certificate-group"];
              const fortiwebIP = annotations["fortiweb-ip"];
              const fortiwebPort = annotations["fortiweb-port"];
              const secretName = annotations["fortiweb-login"];

              if (!certGroup || !fortiwebIP || !fortiwebPort || !secretName) {
                console.error("Missing required annotations in Ingress resource.");
                return;
              }

              console.log(`Annotations found: certGroup=${certGroup}, fortiwebIP=${fortiwebIP}, fortiwebPort=${fortiwebPort}`);

              const secretCommand = `kubectl get secret ${secretName} -o jsonpath='{.data}'`;
              exec(secretCommand, (secretError, secretStdout, secretStderr) => {
                if (secretError) {
                  console.error(`Error fetching secret: ${secretError.message}`);
                  return;
                }
                if (secretStderr) {
                  console.error(`kubectl stderr: ${secretStderr}`);
                  return;
                }

                try {
                  const secretData = JSON.parse(secretStdout);
                  const username = Buffer.from(secretData.username, 'base64').toString('utf-8');
                  const password = Buffer.from(secretData.password, 'base64').toString('utf-8');

                  if (!username || !password) {
                    console.error("Error: Missing username or password in the secret.");
                    return;
                  }

                  console.log("Retrieved username and password successfully.");
                  // Construct the Authorization token
                  const tokenPayload = JSON.stringify({ username, password, vdom: "root" });
                  const token = Buffer.from(tokenPayload).toString('base64');
                  const curlCommand = `curl 'https://${fortiwebIP}:${fortiwebPort}/api/v2.0/cmdb/server-policy/policy?mkey=${ingressName}_${namespace}' --insecure --silent --include -H 'Authorization: ${token}' -X 'PUT' -H 'Content-Type: application/json;charset=utf-8' --data-binary '{"data":{"intermediate-certificate-group":"${certGroup}"}}'`;

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

                    console.log(`Curl command succeeded. Response: ${curlStdout}`);
                  });
                } catch (parseError) {
                  console.error(`Error parsing secret data: ${parseError.message}`);
                }
              });
            } catch (parseError) {
              console.error(`Error parsing annotations: ${parseError.message}`);
            }
          });
        }
      } catch (jsonError) {
        console.error(`Failed to process webhook: ${jsonError.message}`);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', received: body }));
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Only POST method is allowed');
  }
});

server.listen(8080, () => {
  console.log('Webhook handler listening on port 8080');
});
