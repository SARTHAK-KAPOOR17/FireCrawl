import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Flame, AlertCircle } from 'lucide-react';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
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
        return 'No usable email found on your OAuth profile.';
      case 'unverified_email':
        return 'Security restriction: Account linking rejected because the email is not verified on both accounts.';
      case 'invalid_state':
        return 'Security validation failed (CSRF state invalid). Please try again.';
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
        login(response.data.token, response.data.user);
        navigate('/jobs');
      }
    } catch (err) {
      setFormError(err.friendlyMessage || err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider) => {
    const serverUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    window.location.href = `${serverUrl}/auth/${provider}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-500 text-white shadow-sm mb-3">
          <Flame className="w-7 h-7 fill-current" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {isSignUp ? 'Create your FireCrawl account' : 'Sign in to FireCrawl'}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setFormError(null);
            }}
            className="font-medium text-brand-600 hover:text-brand-500 underline underline-offset-2"
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="px-6 py-8 sm:px-10">
          {displayedError && (
            <div className="mb-6 p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {/* Social OAuth Buttons */}
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={() => handleOAuth('google')}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
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
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full justify-center"
              onClick={() => handleOAuth('github')}
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              Continue with GitHub
            </Button>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <Input
                label="Full Name (optional)"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
              />
            )}

            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              helperText={isSignUp ? 'Must be at least 8 characters long' : undefined}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center mt-2"
              loading={loading}
            >
              {isSignUp ? 'Sign up' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
