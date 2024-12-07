FROM node:current-alpine

RUN apk add --no-cache curl && \
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" && \
    install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl && \
    rm kubectl

# Create directory and copy code
WORKDIR /app
COPY server.js .

# Expose port 8080
EXPOSE 8080

# Run server
CMD ["node", "server.js"]

