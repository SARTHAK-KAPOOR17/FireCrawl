import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { AlertCircle } from 'lucide-react';

export default function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
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
          login(response.data.token, response.data.user);

          if (isMounted) {
            navigate('/jobs', { replace: true });
          }
        } else {
          throw new Error(response.data?.message || 'Authentication exchange failed');
        }
      } catch (err) {
        if (isMounted) {
          setStatus('error');
          setErrorMessage(
            err.friendlyMessage ||
              err.response?.data?.message ||
              err.message ||
              'Failed to exchange authorization code'
          );
        }
      }
    };

    exchangeCode();

    return () => {
      isMounted = false;
    };
  }, [code, navigate, login]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 text-center">
        {status === 'processing' ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Spinner size="lg" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Completing authentication...</h3>
            <p className="text-xs text-slate-500">Securing your session and redirecting you to FireCrawl.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Authentication Failed</h3>
            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              {errorMessage}
            </p>
            <div className="pt-2">
              <Link to="/login">
                <Button variant="primary" className="w-full justify-center">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
