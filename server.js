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

          // Fetch ingress annotations
          const kubectlAnnotationsCmd = `kubectl get ingress ${ingressName} -n ${namespace} -o jsonpath='{.metadata.annotations}'`;
          console.log(`Executing command: ${kubectlAnnotationsCmd}`);

          exec(kubectlAnnotationsCmd, (error, stdout, stderr) => {
            if (error) {
              console.error(`Error fetching ingress annotations: ${error.message}`);
              return;
            }
            if (stderr) {
              console.error(`kubectl stderr: ${stderr}`);
              return;
            }

            console.log(`Ingress annotations: ${stdout}`);
            const annotations = JSON.parse(stdout);

            // Check for the specific annotation
            if (annotations['server-policy-intermediate-certificate-group']) {
              const value = annotations['server-policy-intermediate-certificate-group'];
              console.log(`Found annotation 'server-policy-intermediate-certificate-group' with value: ${value}`);

              // Retrieve username and password
              const usernameCmd = `kubectl get secret fortiweb-login-secret -o jsonpath="{.data.username}" | base64 -d`;
              const passwordCmd = `kubectl get secret fortiweb-login-secret -o jsonpath="{.data.password}" | base64 -d`;

              exec(usernameCmd, (usernameError, usernameStdout, usernameStderr) => {
                if (usernameError || usernameStderr) {
                  console.error(`Error fetching username: ${usernameError || usernameStderr}`);
                  return;
                }
                const username = usernameStdout.trim();

                exec(passwordCmd, (passwordError, passwordStdout, passwordStderr) => {
                  if (passwordError || passwordStderr) {
                    console.error(`Error fetching password: ${passwordError || passwordStderr}`);
                    return;
                  }
                  const password = passwordStdout.trim();

                  // Construct the authorization token
                  const token = Buffer.from(JSON.stringify({
                    username,
                    password,
                    vdom: "root"
                  })).toString('base64');

                  // Construct and execute the curl command
                  const curlCmd = `curl 'https://10.0.0.4/api/v2.0/cmdb/server-policy/policy?mkey=${ingressName}_${ingressName}' ` +
                    `--insecure ` +
                    `-H "Authorization:${token}" ` +
                    `-k ` +
                    `-X 'PUT' ` +
                    `-H 'Content-Type: application/json;charset=utf-8' ` +
                    `-H 'Accept: application/json, text/plain, */*' ` +
                    `--data-binary '{"data":{"intermediate-certificate-group":"${value}"}}'`;

                  console.log(`Executing curl command: ${curlCmd}`);
                  exec(curlCmd, (curlError, curlStdout, curlStderr) => {
                    if (curlError) {
                      console.error(`Error executing curl command: ${curlError.message}`);
                      return;
                    }
                    if (curlStderr) {
                      console.error(`Curl stderr: ${curlStderr}`);
                      return;
                    }
                    console.log(`Curl response: ${curlStdout}`);
                  });
                });
              });
            } else {
              console.log(`Annotation 'server-policy-intermediate-certificate-group' not found in ingress annotations.`);
            }
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

