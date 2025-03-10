import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Initialize environment variables
dotenv.config();

// Promisify exec to use with async/await
const execAsync = promisify(exec);

// Initialize the app
const app = express();
const PORT = process.env.PORT || 4000;

// Configure middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Validate and sanitize GitHub PR URL
const parsePrUrl = (prUrl: string) => {
  // Parse the PR URL to get owner, repo, and PR number
  // Example: https://github.com/owner/repo/pull/123
  const prUrlMatch = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!prUrlMatch) {
    throw new Error('Invalid PR URL format. Expected format: https://github.com/owner/repo/pull/123');
  }
  
  const [, owner, repo, prNumber] = prUrlMatch;
  return { owner, repo, prNumber };
};

// Check if gh CLI is installed
app.get('/api/check-gh', async (req, res) => {
  try {
    const { stdout } = await execAsync('gh --version');
    res.json({ 
      installed: true, 
      version: stdout.trim() 
    });
  } catch (error) {
    console.error('Error checking gh CLI:', error);
    res.status(500).json({ 
      installed: false, 
      error: 'GitHub CLI is not installed or not in PATH' 
    });
  }
});

// Get available reviewers (gh auth status)
app.get('/api/reviewers', async (req, res) => {
  try {
    // First check if gh is installed and working
    try {
      const { stdout: versionOutput } = await execAsync('gh --version');
      console.log('GitHub CLI version:', versionOutput.trim());
    } catch (error) {
      console.error('GitHub CLI not installed or not in PATH');
      return res.status(500).json({ 
        error: 'GitHub CLI is not installed or not in PATH' 
      });
    }

    // Try to get auth status
    const { stdout } = await execAsync('gh auth status');
    
    // Log the actual output for debugging
    console.log('GitHub auth status output:', stdout);
    
    // Try multiple regex patterns to match different possible outputs
    let usernameMatch = stdout.match(/Logged in to github\.com as ([^\s]+)/);
    
    if (!usernameMatch) {
      // Try alternative pattern that might appear in some versions
      usernameMatch = stdout.match(/Logged in to github\.com account ([^\s]+)/);
    }
    
    if (!usernameMatch) {
      // Try to extract from a line containing the username
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('as') && line.includes('@')) {
          const parts = line.split('@');
          if (parts.length > 1) {
            const username = parts[1].trim();
            usernameMatch = ['full match', username];
            break;
          }
        }
      }
    }
    
    if (usernameMatch && usernameMatch[1]) {
      const username = usernameMatch[1];
      console.log('Extracted GitHub username:', username);
      
      res.json([
        {
          id: 'current-user',
          username: username,
          displayName: username,
          // Use a default GitHub avatar URL
          photo: `https://github.com/${username}.png`
        }
      ]);
    } else {
      // As a fallback, try to get the user info directly
      try {
        const { stdout: userOutput } = await execAsync('gh api user');
        const userData = JSON.parse(userOutput);
        
        if (userData && userData.login) {
          console.log('Got GitHub username from API:', userData.login);
          
          res.json([
            {
              id: 'current-user',
              username: userData.login,
              displayName: userData.name || userData.login,
              photo: userData.avatar_url || `https://github.com/${userData.login}.png`
            }
          ]);
          return;
        }
      } catch (apiError) {
        console.error('Failed to get user data from GitHub API:', apiError);
      }
      
      res.status(401).json({ 
        error: 'Not authenticated with GitHub CLI. Run "gh auth login" on the server.' 
      });
    }
  } catch (error) {
    console.error('Error checking gh auth status:', error);
    res.status(500).json({ 
      error: 'Failed to get GitHub authentication status. Make sure GitHub CLI is installed and authenticated.' 
    });
  }
});

// Review a pull request (approve, comment, or request changes)
app.post('/api/review-pr', async (req, res) => {
  try {
    const { prUrl, action, comment } = req.body;
    
    if (!prUrl) {
      return res.status(400).json({ message: 'Missing PR URL' });
    }

    if (!['approve', 'comment', 'request-changes'].includes(action)) {
      return res.status(400).json({ 
        message: 'Invalid action. Must be one of: approve, comment, request-changes' 
      });
    }
    
    if ((action === 'comment' || action === 'request-changes') && !comment) {
      return res.status(400).json({ 
        message: `A comment is required when using the '${action}' action` 
      });
    }
    
    try {
      // Parse and validate the PR URL
      const { owner, repo, prNumber } = parsePrUrl(prUrl);
      
      // Construct the gh CLI command based on the action
      let command = `gh pr review "${prNumber}" --repo ${owner}/${repo}`;
      
      switch (action) {
        case 'approve':
          command += ' --approve';
          break;
        case 'comment':
          command += ` --comment "${comment.replace(/"/g, '\\"')}"`;
          break;
        case 'request-changes':
          command += ` --request-changes "${comment.replace(/"/g, '\\"')}"`;
          break;
      }
      
      const { stdout, stderr } = await execAsync(command);
      
      console.log('Review result:', stdout);
      
      if (stderr) {
        console.error('Review stderr:', stderr);
      }
      
      // Get the authenticated user to show who performed the review
      const { stdout: authOutput } = await execAsync('gh auth status');
      const usernameMatch = authOutput.match(/Logged in to github\.com as ([^\s]+)/);
      const username = usernameMatch ? usernameMatch[1] : 'unknown';
      
      // Construct action text for the response message
      let actionText = 'reviewed';
      if (action === 'approve') actionText = 'approved';
      else if (action === 'request-changes') actionText = 'requested changes on';
      
      res.json({ 
        message: `PR ${actionText} successfully`, 
        data: {
          pr: `${owner}/${repo}#${prNumber}`,
          reviewer: username,
          action: action
        }
      });

    } catch (error) {
      // Handle PR URL parsing errors
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error reviewing PR:', error);
    res.status(500).json({ 
      message: 'Failed to review PR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get PR details
app.get('/api/pr-details', async (req, res) => {
  try {
    const prUrl = req.query.url as string;
    
    if (!prUrl) {
      return res.status(400).json({ message: 'Missing PR URL' });
    }
    
    try {
      // Parse and validate the PR URL
      const { owner, repo, prNumber } = parsePrUrl(prUrl);
      
      // Use gh CLI to get PR details
      const { stdout, stderr } = await execAsync(
        `gh pr view ${prNumber} --repo ${owner}/${repo} --json title,state,author,createdAt,body,url,reviewDecision,isDraft`
      );
      
      if (stderr) {
        console.error('PR details stderr:', stderr);
      }
      
      // Parse the JSON output
      const prDetails = JSON.parse(stdout);
      
      res.json({
        success: true,
        data: prDetails
      });

    } catch (error) {
      // Handle PR URL parsing errors
      if (error instanceof Error) {
        return res.status(400).json({ 
          success: false,
          message: error.message 
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error fetching PR details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch PR details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// For backward compatibility - redirect approve-pr to review-pr with approve action
app.post('/api/approve-pr', (req, res, next) => {
  // Set the action to 'approve' and forward to review-pr endpoint
  req.body.action = 'approve';
  
  // Forward the request to the review-pr endpoint
  req.url = '/api/review-pr';
  next();
});

// Add a diagnostic endpoint for troubleshooting
app.get('/api/diagnostics', async (req, res) => {
  const diagnosticInfo: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    tests: {}
  };

  // Test 1: Check if GitHub CLI is installed
  try {
    const { stdout: versionOutput } = await execAsync('gh --version');
    diagnosticInfo.tests.cli_installed = {
      success: true,
      version: versionOutput.trim()
    };
  } catch (error) {
    diagnosticInfo.tests.cli_installed = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // Only proceed with auth tests if CLI is installed
  if (diagnosticInfo.tests.cli_installed.success) {
    // Test 2: Check auth status
    try {
      const { stdout: authOutput } = await execAsync('gh auth status');
      diagnosticInfo.tests.auth_status = {
        success: true,
        raw_output: authOutput.trim()
      };

      // Check if the output indicates successful authentication
      if (authOutput.includes('Logged in')) {
        diagnosticInfo.tests.auth_status.authenticated = true;
      } else {
        diagnosticInfo.tests.auth_status.authenticated = false;
      }
    } catch (error) {
      diagnosticInfo.tests.auth_status = {
        success: false,
        authenticated: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 3: Try to access GitHub API
    try {
      const { stdout: apiOutput } = await execAsync('gh api user');
      const userData = JSON.parse(apiOutput);
      diagnosticInfo.tests.api_access = {
        success: true,
        username: userData.login,
        user_data: {
          name: userData.name,
          id: userData.id
        }
      };
    } catch (error) {
      diagnosticInfo.tests.api_access = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test 4: Check scopes
    try {
      const { stdout: scopeOutput } = await execAsync('gh auth status -s');
      const scopes = scopeOutput.trim().split(',');
      diagnosticInfo.tests.auth_scopes = {
        success: true,
        scopes: scopes
      };
    } catch (error) {
      diagnosticInfo.tests.auth_scopes = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  res.json(diagnosticInfo);
});

// Merge a pull request
app.post('/api/merge-pr', async (req, res) => {
  try {
    const { prUrl, strategy = 'squash', deleteBranch = false } = req.body;
    
    if (!prUrl) {
      return res.status(400).json({ message: 'Missing PR URL' });
    }
    
    if (!['merge', 'squash', 'rebase'].includes(strategy)) {
      return res.status(400).json({ 
        message: 'Invalid merge strategy. Must be one of: merge, squash, rebase' 
      });
    }
    
    try {
      // Parse and validate the PR URL
      const { owner, repo, prNumber } = parsePrUrl(prUrl);
      
      // Construct the gh CLI command for merging
      let command = `gh pr merge "${prNumber}" --repo ${owner}/${repo}`;
      
      // Add strategy flag
      switch (strategy) {
        case 'merge':
          command += ' --merge';
          break;
        case 'squash':
          command += ' --squash';
          break;
        case 'rebase':
          command += ' --rebase';
          break;
      }
      
      // Add delete branch flag if requested
      if (deleteBranch) {
        command += ' --delete-branch';
      }
      
      const { stdout, stderr } = await execAsync(command);
      
      console.log('Merge result:', stdout);
      
      if (stderr) {
        console.error('Merge stderr:', stderr);
      }
      
      // Get the authenticated user
      const { stdout: authOutput } = await execAsync('gh auth status');
      const usernameMatch = authOutput.match(/Logged in to github\.com as ([^\s]+)/);
      const username = usernameMatch ? usernameMatch[1] : 'unknown';
      
      res.json({ 
        message: `PR ${strategy === 'squash' ? 'squash merged' : strategy === 'rebase' ? 'rebased and merged' : 'merged'} successfully`, 
        data: {
          pr: `${owner}/${repo}#${prNumber}`,
          user: username,
          strategy: strategy,
          branchDeleted: deleteBranch
        }
      });
    } catch (error) {
      // Handle PR URL parsing errors or other errors
      if (error instanceof Error) {
        return res.status(400).json({ message: error.message });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error merging PR:', error);
    res.status(500).json({ 
      message: 'Failed to merge PR', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/build/index.html'));
  });
}

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 