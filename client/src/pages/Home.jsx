import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function Home() {
  const [healthStatus, setHealthStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch (_) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
    setCurrentUser(null);
  };

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
        <div style={styles.navBar}>
          <h1 style={styles.title}>🔥 FireCrawl</h1>
          <div>
            {currentUser ? (
              <div style={styles.userProfile}>
                {currentUser.avatarUrl && (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    style={styles.avatar}
                  />
                )}
                <span>{currentUser.name || currentUser.email}</span>
                <button onClick={handleLogout} style={styles.logoutBtn}>
                  Log Out
                </button>
              </div>
            ) : (
              <Link to="/login" style={styles.loginBtn}>
                Sign In / Register
              </Link>
            )}
          </div>
        </div>
        <p style={styles.subtitle}>Web scraping and data extraction engine</p>
      </header>

      {currentUser && (
        <div style={styles.authNotice}>
          <h3>Welcome, {currentUser.name || currentUser.email}!</h3>
          <p>
            You are authenticated via OAuth. Linked providers:{' '}
            <strong>
              {currentUser.providers?.map((p) => p.provider).join(', ') || 'N/A'}
            </strong>
          </p>
        </div>
      )}

      <main style={styles.card}>
        <h2>System Status</h2>
        <p style={{ marginTop: '8px' }}>
          API Base URL: <code>{api.defaults.baseURL}</code>
        </p>
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
  },
  navBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  title: {
    fontSize: '2.5rem',
    color: '#ea580c',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#666',
  },
  userProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '0.95rem',
    fontWeight: '500',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  logoutBtn: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  loginBtn: {
    display: 'inline-block',
    padding: '8px 16px',
    borderRadius: '6px',
    backgroundColor: '#ea580c',
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: '500',
    fontSize: '0.95rem',
  },
  authNotice: {
    backgroundColor: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '24px',
    color: '#065f46',
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
