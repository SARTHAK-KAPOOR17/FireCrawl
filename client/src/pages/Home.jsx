import React, { useState } from 'react';
import api from '../api/axios';

export default function Home() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/health');
      setHealthStatus(response.data);
    } catch (err) {
      setError(err.message || 'Failed to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🔥 FireCrawl</h1>
        <p style={styles.subtitle}>Web scraping and data extraction engine</p>
      </header>

      <main style={styles.card}>
        <h2>System Status</h2>
        <p>API Base URL: <code>{api.defaults.baseURL}</code></p>
        <button
          style={styles.button}
          onClick={checkHealth}
          disabled={loading}
        >
          {loading ? 'Checking...' : 'Check Server Health'}
        </button>

        {error && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {healthStatus && (
          <div style={styles.statusBox}>
            <pre>{JSON.stringify(healthStatus, null, 2)}</pre>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  container: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '800px',
    margin: '40px auto',
    padding: '0 20px',
    color: '#1a1a1a',
  },
  header: {
    marginBottom: '32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '8px',
    color: '#ea580c',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#666',
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  },
  button: {
    backgroundColor: '#ea580c',
    color: '#ffffff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '12px',
  },
  statusBox: {
    marginTop: '16px',
    padding: '16px',
    backgroundColor: '#f3f4f6',
    borderRadius: '8px',
    overflowX: 'auto',
  },
  errorBox: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '8px',
  },
};
