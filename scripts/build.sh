#!/bin/bash

# Exit on any error
set -e

# Display info
echo "Building GitHub PR Approver Docker image..."

# Build the Docker image
docker build -t github-pr-approver .

echo "Build completed successfully!"
echo ""
echo "To start the container, run: ./scripts/start.sh" 