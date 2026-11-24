import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oauthErrorKey = searchParams.get('error');

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);

  const oauthErrorMessage = useMemo(() => {
    switch (oauthErrorKey) {
      case 'no_email':
        return 'No usable email found on your OAuth profile. Please ensure your email is verified and accessible.';
      case 'unverified_email':
        return 'Security restriction: Account linking rejected because the email is not verified on both accounts.';
      case 'invalid_state':
        return 'Security validation failed (invalid or expired CSRF state). Please try again.';
      case 'oauth_failed':
        return 'OAuth authentication failed. Please try again.';
      case 'access_denied':
        return 'Access was denied by the authentication provider.';
      case 'server_error':
        return 'A server error occurred during authentication.';
      default:
        return oauthErrorKey ? `Authentication error: ${oauthErrorKey}` : null;
    }
  }, [oauthErrorKey]);

  const displayedError = formError || oauthErrorMessage;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError('Email and password are required.');
      return;
    }

    if (isSignUp && password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = isSignUp ? '/auth/signup' : '/auth/login';
      const payload = isSignUp ? { email, password, name } : { email, password };

      const response = await api.post(endpoint, payload);

      if (response.data?.success && response.data?.token) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        navigate('/', { replace: true });
      } else {
        throw new Error(response.data?.message || 'Authentication failed');
      }
    } catch (err) {
      const errResponse = err.response?.data;
      const errorMsg =
        errResponse?.errors?.[0]?.message ||
        errResponse?.message ||
        err.message ||
        'Authentication failed. Please check your credentials.';
      setFormError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = (provider) => {
    const baseURL = api.defaults.baseURL || 'http://localhost:5000';
    window.location.href = `${baseURL}/auth/${provider}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Link to="/" style={styles.backLink}>← Back to Home</Link>
          <h1 style={styles.title}>
            {isSignUp ? 'Create your Account' : 'Sign In to FireCrawl'}
          </h1>
          <p style={styles.subtitle}>
            {isSignUp
              ? 'Sign up with email or an OAuth provider to get started.'
              : 'Welcome back! Sign in or register below.'}
          </p>
        </div>

        {displayedError && (
          <div style={styles.errorBox}>
            <strong>Error:</strong> {displayedError}
          </div>
        )}

        {/* Email Login/Signup Form */}
        <form style={styles.form} onSubmit={handleSubmit}>
          {isSignUp && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Name (Optional)</label>
              <input
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={styles.input}
                disabled={loading}
              />
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              required
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              required
              disabled={loading}
            />
            {isSignUp && (
              <span style={styles.hint}>Must be at least 8 characters long</span>
            )}
          </div>

          <button
            type="submit"
            style={{
              ...styles.submitButton,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading
              ? 'Processing...'
              : isSignUp
              ? 'Create Account'
              : 'Sign In with Email'}
          </button>
        </form>

        <div style={styles.toggleContainer}>
          <span style={styles.toggleText}>
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setFormError(null);
            }}
            style={styles.toggleButton}
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>

        <div style={styles.divider}>
          <span style={styles.dividerLine}></span>
          <span style={styles.dividerText}>OR CONTINUE WITH</span>
          <span style={styles.dividerLine}></span>
        </div>

        {/* OAuth Buttons */}
        <div style={styles.oauthContainer}>
          <button
            type="button"
            onClick={() => handleOAuthLogin('google')}
            style={styles.googleButton}
          >
            <svg style={styles.oauthIcon} viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => handleOAuthLogin('github')}
            style={styles.githubButton}
          >
            <svg style={styles.oauthIcon} viewBox="0 0 24 24" fill="currentColor">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            Continue with GitHub
          </button>
        </div>
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
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    width: '100%',
    maxWidth: '440px',
    padding: '32px',
  },
  header: {
    marginBottom: '24px',
  },
  backLink: {
    display: 'inline-block',
    marginBottom: '16px',
    color: '#64748b',
    textDecoration: 'none',
    fontSize: '0.875rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '0.95rem',
    color: '#64748b',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#334155',
  },
  input: {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '0.95rem',
    backgroundColor: '#ffffff',
    outline: 'none',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#64748b',
  },
  submitButton: {
    backgroundColor: '#ea580c',
    color: '#ffffff',
    border: 'none',
    padding: '12px',
    borderRadius: '6px',
    fontWeight: '600',
    fontSize: '0.95rem',
    marginTop: '6px',
    transition: 'background-color 0.2s',
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '16px',
    fontSize: '0.9rem',
  },
  toggleText: {
    color: '#64748b',
  },
  toggleButton: {
    background: 'none',
    border: 'none',
    color: '#ea580c',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
    fontSize: '0.9rem',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    margin: '24px 0',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    padding: '0 12px',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#94a3b8',
    letterSpacing: '0.05em',
  },
  oauthContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  googleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '11px 16px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#1e293b',
    fontWeight: '500',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  githubButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '11px 16px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#24292f',
    color: '#ffffff',
    fontWeight: '500',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  oauthIcon: {
    width: '20px',
    height: '20px',
  },
};
