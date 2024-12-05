FROM node:18-alpine

# Create directory and copy code
WORKDIR /app
COPY server.js .

# Expose port 8080
EXPOSE 8080

# Run server
CMD ["node", "server.js"]

