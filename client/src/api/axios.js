import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getFriendlyErrorMessage(errData) {
  if (!errData) return 'An unexpected error occurred. Please try again.';

  const code = errData.code;
  const message = errData.message;

  switch (code) {
    case 'VALIDATION_ERROR':
      if (Array.isArray(errData.details) && errData.details.length > 0) {
        const fieldErrors = errData.details
          .map((d) => (d.field ? `${d.field}: ${d.message}` : d.message))
          .join(', ');
        return `Validation failed: ${fieldErrors}`;
      }
      return message || 'Please check your inputs and try again.';
    case 'AUTHENTICATION_ERROR':
      return message || 'Authentication failed. Please check your credentials or log in again.';
    case 'AUTHORIZATION_ERROR':
      return 'You do not have permission to perform this action.';
    case 'NOT_FOUND':
      return message || 'The requested resource was not found.';
    case 'CONFLICT':
      return message || 'A resource conflict occurred (e.g. active run or duplicate).';
    case 'RATE_LIMIT_EXCEEDED':
      return 'Rate limit exceeded. Please wait a moment before trying again.';
    case 'INTERNAL_ERROR':
      return 'An internal server error occurred. Please try again later.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}

// Request interceptor: attach Bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: 401 redirect & format error message
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errData = error.response?.data;

    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    error.friendlyMessage = getFriendlyErrorMessage(errData);
    error.apiError = errData;

    return Promise.reject(error);
  }
);

export default api;
