# GitHub PR Approver

A simple web application for GitHub pull request reviews. This application uses the GitHub CLI tool to approve, comment on, or request changes to pull requests.

## Features

- Simple interface to submit a PR for review
- PR details preview before reviewing (title, description, state, author)
- State-aware review actions (prevents reviewing closed, merged, or draft PRs)
- Three review actions supported:
  - **Approve** - Mark the PR as approved
  - **Comment** - Add a comment to the PR without approval or rejection
  - **Request Changes** - Request changes before the PR can be merged
- No need for OAuth setup
- Leverages GitHub CLI credentials

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: React + TypeScript
- **GitHub Integration**: GitHub CLI (gh)

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- GitHub CLI (gh) installed and authenticated on the server machine

## Setup

1. Clone the repository:
```
git clone https://github.com/yourusername/github-pr-approver.git
cd github-pr-approver
```

2. Install GitHub CLI on the server:
   - Follow the installation instructions at: https://cli.github.com/
   - Authenticate with GitHub:
   ```
   gh auth login
   ```
   - Make sure to authenticate with proper permissions for the repositories where you want to review PRs

3. Set up environment variables:
   - Create a `.env` file in the `server` directory (copy from `.env.example`)
   ```
   PORT=4000
   FRONTEND_URL=http://localhost:3000
   ```

4. Install dependencies:
```
npm run install-all
```

5. Start the development servers:
```
npm start
```

This will start both the backend server on port 4000 and the frontend server on port 3000.

## Usage

1. Visit `http://localhost:3000` in your browser
2. The application will check if GitHub CLI is installed and authenticated
3. Enter a GitHub Pull Request URL in the input box
4. The application will automatically fetch and display PR details:
   - PR title and state (open, closed, merged, draft)
   - Author and creation date
   - PR description
   - Current review decision status
5. Select the review action you want to perform:
   - **Approve** - Approve the PR
   - **Comment** - Add a comment to the PR
   - **Request Changes** - Request changes on the PR
6. For Comment and Request Changes actions, enter your comment in the text field
7. Click the action button to perform the selected review action
8. The server will use the GitHub CLI to execute the action with the authenticated user's account

## How It Works

The application works by:
1. Using the GitHub CLI (`gh`) that's installed on the server
2. The CLI tool uses the authentication that was set up with `gh auth login`
3. When you submit a PR URL, the app fetches PR details using `gh pr view` 
4. When you select an action, the server runs a command like:
   ```
   gh pr review owner/repo#123 --approve
   gh pr review owner/repo#123 --comment "Your comment here"
   gh pr review owner/repo#123 --request-changes "Your requested changes here"
   ```
5. This performs the selected review action as the user who is authenticated with the GitHub CLI

## Advantages Over OAuth

- Simpler setup (no need to create GitHub OAuth App)
- Uses the same authentication as the GitHub CLI
- No token management in the application
- More secure since it doesn't store any credentials

## Security Considerations

- Anyone with access to the web interface can review PRs as the authenticated GitHub user
- In a production environment, you should:
  - Add authentication to the web interface
  - Implement proper access controls
  - Use HTTPS for all communication
  - Add rate limiting
  - Implement proper error handling and logging

## License

MIT
