import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get('code');

  const [status, setStatus] = useState('processing'); // 'processing' | 'error'
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMessage('Missing authorization code in URL.');
      return;
    }

    let isMounted = true;

    const exchangeCode = async () => {
      try {
        const response = await api.post('/auth/oauth/exchange', { code });

        if (response.data?.success && response.data?.token) {
          // Store token and user data
          localStorage.setItem('token', response.data.token);
          localStorage.setItem('user', JSON.stringify(response.data.user));

          // Set default Authorization header on axios instance
          api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;

          if (isMounted) {
            navigate('/', { replace: true });
          }
        } else {
          throw new Error(response.data?.message || 'Authentication exchange failed');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(
            err.response?.data?.message || err.message || 'Failed to exchange authorization code'
          );
        }
      }
    };

    exchangeCode();

    return () => {
      isMounted = false;
    };
  }, [code, navigate]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'processing' ? (
          <div>
            <div style={styles.spinner}></div>
            <h2 style={styles.title}>Completing Authentication...</h2>
            <p style={styles.subtitle}>Securely exchanging your authorization code.</p>
          </div>
        ) : (
          <div>
            <div style={styles.errorIcon}>✕</div>
            <h2 style={styles.errorTitle}>Authentication Failed</h2>
            <p style={styles.errorMessage}>{errorMessage}</p>
            <Link to="/login" style={styles.button}>
              Return to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    width: '100%',
    maxWidth: '420px',
    padding: '40px 32px',
    textAlign: 'center',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#0f172a',
    marginTop: '16px',
    marginBottom: '8px',
  },
  subtitle: {
    color: '#64748b',
    fontSize: '0.95rem',
  },
  spinner: {
    width: '40px',
    height: '40px',
    margin: '0 auto',
    border: '4px solid #fed7aa',
    borderTop: '4px solid #ea580c',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorIcon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    fontSize: '1.5rem',
    fontWeight: 'bold',
  },
  errorTitle: {
    fontSize: '1.4rem',
    fontWeight: '700',
    color: '#991b1b',
    marginBottom: '8px',
  },
  errorMessage: {
    color: '#64748b',
    fontSize: '0.95rem',
    marginBottom: '24px',
  },
  button: {
    display: 'inline-block',
    backgroundColor: '#ea580c',
    color: '#ffffff',
    textDecoration: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.95rem',
  },
};
