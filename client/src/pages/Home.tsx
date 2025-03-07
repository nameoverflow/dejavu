import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Define types
interface Reviewer {
  id: string;
  username: string;
  displayName: string;
  photo: string;
}

interface ApprovalResult {
  success: boolean;
  message: string;
  data?: {
    pr: string;
    reviewer: string;
    action: string;
  };
}

interface PRDetails {
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  author: {
    login: string;
  };
  createdAt: string;
  body: string;
  url: string;
  reviewDecision: string;
  isDraft: boolean;
}

type ReviewAction = 'approve' | 'comment' | 'request-changes';

const Home: React.FC = () => {
  const [prUrl, setPrUrl] = useState<string>('');
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [ghCliStatus, setGhCliStatus] = useState<{installed: boolean, version?: string, error?: string} | null>(null);
  const [result, setResult] = useState<ApprovalResult | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction>('approve');
  const [comment, setComment] = useState<string>('');
  const [prDetails, setPrDetails] = useState<PRDetails | null>(null);
  const [prError, setPrError] = useState<string | null>(null);
  const [debouncedPrUrl, setDebouncedPrUrl] = useState<string>('');
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [runningDiagnostics, setRunningDiagnostics] = useState<boolean>(false);

  // Check GitHub CLI status
  useEffect(() => {
    const checkGhCli = async () => {
      try {
        const response = await axios.get('/api/check-gh');
        setGhCliStatus(response.data);
      } catch (error) {
        console.error('Failed to check GitHub CLI status:', error);
        setGhCliStatus({
          installed: false,
          error: 'Could not connect to server or GitHub CLI is not available'
        });
      }
    };

    checkGhCli();
  }, []);

  // Fetch available reviewers (logged in GitHub CLI user)
  useEffect(() => {
    const fetchReviewers = async () => {
      try {
        if (ghCliStatus?.installed) {
          const response = await axios.get('/api/reviewers');
          setReviewers(response.data);
          if (response.data.length > 0) {
            setSelectedReviewerId(response.data[0].id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch reviewers:', error);
      }
    };

    if (ghCliStatus?.installed) {
      fetchReviewers();
    }
  }, [ghCliStatus]);

  // Debounce PR URL input to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      if (prUrl) {
        setDebouncedPrUrl(prUrl);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [prUrl]);

  // Fetch PR details when URL changes
  useEffect(() => {
    const fetchPrDetails = async () => {
      if (!debouncedPrUrl || !isValidPrUrl(debouncedPrUrl)) return;
      
      setDetailsLoading(true);
      setPrError(null);
      setPrDetails(null);
      
      try {
        const response = await axios.get('/api/pr-details', {
          params: { url: debouncedPrUrl }
        });
        
        if (response.data.success) {
          setPrDetails(response.data.data);
        } else {
          setPrError(response.data.message);
        }
      } catch (error: any) {
        console.error('Failed to fetch PR details:', error);
        setPrError(error.response?.data?.message || 'Failed to fetch PR details');
      } finally {
        setDetailsLoading(false);
      }
    };
    
    fetchPrDetails();
  }, [debouncedPrUrl]);

  // Validate PR URL format
  const isValidPrUrl = (url: string): boolean => {
    return /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.test(url);
  };

  // Handle PR URL input change
  const handlePrUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrUrl(e.target.value);
    
    // Clear PR details if the URL is cleared
    if (!e.target.value) {
      setPrDetails(null);
      setPrError(null);
    }
  };

  // Handle comment input change
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setComment(e.target.value);
  };

  // Handle review action change
  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setReviewAction(e.target.value as ReviewAction);
  };

  // Format date in a more readable format
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get status badge class based on PR state
  const getStatusBadgeClass = (state: string, isDraft: boolean): string => {
    if (isDraft) return 'state-draft';
    if (state === 'OPEN') return 'state-open';
    if (state === 'CLOSED') return 'state-closed';
    if (state === 'MERGED') return 'state-merged';
    return '';
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prUrl) {
      return;
    }

    // Validate that a comment is provided for comment or request-changes actions
    if ((reviewAction === 'comment' || reviewAction === 'request-changes') && !comment.trim()) {
      setResult({
        success: false,
        message: `A comment is required when using the '${reviewAction}' action`
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await axios.post('/api/review-pr', { 
        prUrl,
        action: reviewAction, 
        comment: comment.trim() || undefined
      });

      setResult({
        success: true,
        message: response.data.message,
        data: response.data.data
      });
      
      // Clear comment if successful
      if (reviewAction !== 'approve') {
        setComment('');
      }
      
      // Refresh PR details after successful review
      setTimeout(() => {
        setDebouncedPrUrl(prUrl);
      }, 1000);
    } catch (error: any) {
      setResult({
        success: false,
        message: error.response?.data?.message || 'Failed to review PR'
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to run diagnostics
  const runDiagnostics = async () => {
    setRunningDiagnostics(true);
    setDiagnosticData(null);
    
    try {
      const response = await axios.get('/api/diagnostics');
      setDiagnosticData(response.data);
      setShowDiagnostics(true);
    } catch (error) {
      console.error('Failed to run diagnostics:', error);
      setDiagnosticData({
        error: 'Failed to fetch diagnostic data from the server'
      });
    } finally {
      setRunningDiagnostics(false);
    }
  };

  // Show setup instructions if GitHub CLI is not installed or not authenticated
  if (ghCliStatus === null) {
    return <div className="loading">Checking GitHub CLI status...</div>;
  }

  if (!ghCliStatus.installed) {
    return (
      <div className="home-container">
        <div className="card error-card">
          <h2 className="card-title">GitHub CLI Not Available</h2>
          <p>The GitHub CLI (gh) is not installed or not properly configured on the server.</p>
          <p>Error: {ghCliStatus.error}</p>
          <h3>Installation Instructions:</h3>
          <ol>
            <li>Install GitHub CLI on the server: <code>https://cli.github.com/</code></li>
            <li>Authenticate with GitHub: <code>gh auth login</code></li>
            <li>Ensure the CLI has access to the repositories you want to approve PRs for</li>
            <li>Restart the server application</li>
          </ol>
        </div>
      </div>
    );
  }

  if (reviewers.length === 0) {
    return (
      <div className="home-container">
        <div className="card error-card">
          <h2 className="card-title">GitHub CLI Not Authenticated</h2>
          <p>The GitHub CLI is installed but not authenticated. Please run the following command on the server:</p>
          <pre><code>gh auth login</code></pre>
          <p>Then restart the application or refresh this page.</p>
          
          <div className="manual-auth-section">
            <h3>If the above doesn't work, try this manual method:</h3>
            <ol>
              <li>Run <code>gh auth login</code> on the server and follow the prompts</li>
              <li>Then run <code>gh api user</code> to verify authentication is working</li>
              <li>Restart the server application</li>
              <li>
                If the issue persists, you may need to check GitHub CLI's version with <code>gh --version</code>
                and ensure it's up to date with <code>gh upgrade</code>
              </li>
            </ol>
          </div>
          
          <div className="diagnostics-section">
            <button 
              onClick={runDiagnostics} 
              disabled={runningDiagnostics}
              className="diagnostics-button"
            >
              {runningDiagnostics ? 'Running Diagnostics...' : 'Run Diagnostics'}
            </button>
            
            {showDiagnostics && diagnosticData && (
              <div className="diagnostics-results">
                <h3>Diagnostic Results</h3>
                
                {diagnosticData.error ? (
                  <div className="diagnostics-error">
                    <p>{diagnosticData.error}</p>
                  </div>
                ) : (
                  <>
                    <div className="diagnostics-summary">
                      <p><strong>Timestamp:</strong> {diagnosticData.timestamp}</p>
                      <p><strong>Environment:</strong> {diagnosticData.environment}</p>
                      <p><strong>Node Version:</strong> {diagnosticData.node_version}</p>
                    </div>
                    
                    <div className="diagnostics-tests">
                      <h4>Test Results:</h4>
                      
                      <div className={`test-item ${diagnosticData.tests.cli_installed?.success ? 'success' : 'failure'}`}>
                        <strong>GitHub CLI Installation: </strong>
                        {diagnosticData.tests.cli_installed?.success ? (
                          <span>✅ Installed - {diagnosticData.tests.cli_installed.version}</span>
                        ) : (
                          <span>❌ Not installed - {diagnosticData.tests.cli_installed?.error}</span>
                        )}
                      </div>
                      
                      {diagnosticData.tests.auth_status && (
                        <div className={`test-item ${diagnosticData.tests.auth_status.authenticated ? 'success' : 'failure'}`}>
                          <strong>Authentication Status: </strong>
                          {diagnosticData.tests.auth_status.authenticated ? (
                            <span>✅ Authenticated</span>
                          ) : (
                            <span>❌ Not authenticated</span>
                          )}
                          {diagnosticData.tests.auth_status.error && (
                            <div className="test-error">Error: {diagnosticData.tests.auth_status.error}</div>
                          )}
                          {diagnosticData.tests.auth_status.raw_output && (
                            <div className="test-details">
                              <details>
                                <summary>Raw output</summary>
                                <pre>{diagnosticData.tests.auth_status.raw_output}</pre>
                              </details>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {diagnosticData.tests.api_access && (
                        <div className={`test-item ${diagnosticData.tests.api_access.success ? 'success' : 'failure'}`}>
                          <strong>GitHub API Access: </strong>
                          {diagnosticData.tests.api_access.success ? (
                            <span>✅ Working - Authenticated as {diagnosticData.tests.api_access.username}</span>
                          ) : (
                            <span>❌ Failed - {diagnosticData.tests.api_access.error}</span>
                          )}
                        </div>
                      )}
                      
                      {diagnosticData.tests.auth_scopes && (
                        <div className={`test-item ${diagnosticData.tests.auth_scopes.success ? 'success' : 'failure'}`}>
                          <strong>Authentication Scopes: </strong>
                          {diagnosticData.tests.auth_scopes.success ? (
                            <span>✅ Available: {diagnosticData.tests.auth_scopes.scopes.join(', ')}</span>
                          ) : (
                            <span>❌ Failed to retrieve - {diagnosticData.tests.auth_scopes.error}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="diagnostics-recommendations">
                      <h4>Recommendations:</h4>
                      <ul>
                        {!diagnosticData.tests.cli_installed?.success && (
                          <li>Install GitHub CLI following the instructions at <a href="https://cli.github.com/" target="_blank" rel="noopener noreferrer">https://cli.github.com/</a></li>
                        )}
                        
                        {diagnosticData.tests.cli_installed?.success && !diagnosticData.tests.auth_status?.authenticated && (
                          <li>Authenticate with GitHub CLI by running <code>gh auth login</code> and following the prompts</li>
                        )}
                        
                        {diagnosticData.tests.cli_installed?.success && diagnosticData.tests.auth_status?.authenticated && !diagnosticData.tests.api_access?.success && (
                          <li>Your authentication seems incomplete. Try running <code>gh auth refresh</code> to refresh your token</li>
                        )}
                        
                        {diagnosticData.tests.auth_scopes?.success && !diagnosticData.tests.auth_scopes.scopes.includes('repo') && (
                          <li>Your authentication is missing the 'repo' scope needed for PR approvals. Run <code>gh auth refresh -s repo</code></li>
                        )}
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-container">
      <div className="card">
        <h2 className="card-title">Review a GitHub Pull Request</h2>
        <p className="cli-status">
          <span className="status-label">GitHub CLI:</span> 
          <span className="status-value success">Installed ({ghCliStatus.version})</span>
        </p>
        <p className="reviewer-status">
          <span className="status-label">Authenticated as:</span> 
          {reviewers.length > 0 && (
            <span className="status-value">
              <img src={reviewers[0].photo} alt={reviewers[0].displayName} className="reviewer-avatar" />
              {reviewers[0].displayName}
            </span>
          )}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="prUrl">GitHub Pull Request URL</label>
            <input
              type="text"
              id="prUrl"
              value={prUrl}
              onChange={handlePrUrlChange}
              placeholder="https://github.com/owner/repo/pull/123"
              required
            />
          </div>
          
          {detailsLoading && (
            <div className="pr-details-loading">
              <p>Loading PR details...</p>
            </div>
          )}
          
          {prError && (
            <div className="pr-error">
              <p>{prError}</p>
            </div>
          )}
          
          {prDetails && (
            <div className="pr-details">
              <div className="pr-header">
                <h3 className="pr-title">{prDetails.title}</h3>
                <div className={`pr-state ${getStatusBadgeClass(prDetails.state, prDetails.isDraft)}`}>
                  {prDetails.isDraft ? 'DRAFT' : prDetails.state}
                </div>
              </div>
              
              <div className="pr-meta">
                <p>
                  <strong>Author:</strong> {prDetails.author.login} •{' '}
                  <strong>Created:</strong> {formatDate(prDetails.createdAt)}
                </p>
                {prDetails.reviewDecision && (
                  <p><strong>Review Decision:</strong> {prDetails.reviewDecision}</p>
                )}
              </div>
              
              {prDetails.body && (
                <div className="pr-description">
                  <strong>Description:</strong>
                  <p>{prDetails.body}</p>
                </div>
              )}
              
              {/* Disable the form if PR is not open or is a draft */}
              {(prDetails.state !== 'OPEN' || prDetails.isDraft) && (
                <div className="pr-warning">
                  {prDetails.isDraft ? (
                    <p>⚠️ This PR is in draft state and cannot be reviewed yet.</p>
                  ) : (
                    <p>⚠️ This PR is {prDetails.state.toLowerCase()} and cannot be reviewed.</p>
                  )}
                </div>
              )}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="action">Review Action</label>
            <select 
              id="action" 
              value={reviewAction} 
              onChange={handleActionChange}
              className="action-select"
              disabled={prDetails?.state !== 'OPEN' || prDetails?.isDraft}
            >
              <option value="approve">Approve</option>
              <option value="comment">Comment</option>
              <option value="request-changes">Request Changes</option>
            </select>
          </div>
          
          {(reviewAction === 'comment' || reviewAction === 'request-changes') && (
            <div className="form-group">
              <label htmlFor="comment">
                {reviewAction === 'comment' ? 'Comment' : 'Change Request Comment'}
              </label>
              <textarea
                id="comment"
                value={comment}
                onChange={handleCommentChange}
                placeholder={`Add your ${reviewAction === 'comment' ? 'comment' : 'change request reasoning'} here...`}
                rows={4}
                required
                disabled={prDetails?.state !== 'OPEN' || prDetails?.isDraft}
              />
            </div>
          )}
          
          <button 
            type="submit" 
            disabled={
              !prUrl || 
              loading || 
              ((reviewAction === 'comment' || reviewAction === 'request-changes') && !comment.trim()) ||
              prDetails?.state !== 'OPEN' ||
              prDetails?.isDraft
            }
            className={`action-button ${reviewAction}`}
          >
            {loading ? 'Processing...' : (
              reviewAction === 'approve' ? 'Approve PR' : 
              reviewAction === 'comment' ? 'Comment on PR' : 
              'Request Changes'
            )}
          </button>
        </form>
        
        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <p>{result.message}</p>
            {result.data && (
              <p>
                Pull request {result.data.pr} was {
                  result.data.action === 'approve' ? 'approved' :
                  result.data.action === 'comment' ? 'commented on' :
                  'requested changes'
                } by {result.data.reviewer}.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home; 