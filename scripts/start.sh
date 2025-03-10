#!/bin/bash

# Exit on any error
set -e

# Check if an alternate port was provided
PORT=${1:-3000}

# Display info
echo "Starting GitHub PR Approver container on port $PORT..."
echo "Note: You will need to authenticate GitHub CLI by running the following commands:"
echo "  docker exec -it github-pr-approver gh auth login"
echo ""

# Run the container
docker run -d \
  -p $PORT:3000 \
  -v gh-auth:/root/.config/gh \
  --restart unless-stopped \
  github-pr-approver

echo ""
echo "Container started! Access the application at: http://localhost:$PORT"
echo ""
echo "Don't forget to authenticate with GitHub CLI:"
echo "  docker exec -it github-pr-approver gh auth login" 