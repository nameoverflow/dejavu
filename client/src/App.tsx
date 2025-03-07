import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>GitHub PR Approver</h1>
        <div className="app-description">
          A simple tool to approve GitHub pull requests using GitHub CLI
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <footer>
        <p>&copy; {new Date().getFullYear()} GitHub PR Approver</p>
        <p className="footer-note">
          This application uses the GitHub CLI (gh) installed on the server to approve pull requests.
        </p>
      </footer>
    </div>
  );
}

export default App; 