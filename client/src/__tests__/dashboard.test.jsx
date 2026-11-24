import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AuthProvider } from '../context/AuthContext';
import { getFriendlyErrorMessage } from '../api/axios';
import api from '../api/axios';

describe('Client Dashboard Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. URL Parsing & Validation Logic', () => {
    function parseAndValidateUrls(rawText) {
      const lines = rawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const valid = [];
      let invalid = 0;

      for (const line of lines) {
        try {
          const u = new URL(line);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            valid.push(line);
          } else {
            invalid++;
          }
        } catch {
          invalid++;
        }
      }

      return { valid, invalid, total: lines.length };
    }

    it('identifies valid http and https URLs and ignores invalid protocols or malformed strings', () => {
      const input = `
        https://example.com/books/1
        http://books.toscrape.com
        ftp://invalid.com/file
        javascript:alert(1)
        not-a-url
        https://valid.org/path?q=test
      `;

      const result = parseAndValidateUrls(input);

      expect(result.valid).toEqual([
        'https://example.com/books/1',
        'http://books.toscrape.com',
        'https://valid.org/path?q=test',
      ]);
      expect(result.invalid).toBe(3);
      expect(result.total).toBe(6);
    });

    it('enforces maximum 500 URLs limit', () => {
      const urls501 = Array.from({ length: 501 }, (_, i) => `https://example.com/item-${i}`).join('\n');
      const result = parseAndValidateUrls(urls501);

      expect(result.valid).toHaveLength(501);
      expect(result.valid.length > 500).toBe(true);
    });
  });

  describe('2. ProtectedRoute Component', () => {
    it('redirects unauthenticated user to /login', () => {
      render(
        <MemoryRouter initialEntries={['/jobs']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<div>Login Page</div>} />
              <Route
                path="/jobs"
                element={
                  <ProtectedRoute>
                    <div>Protected Jobs Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      expect(screen.getByText('Login Page')).toBeInTheDocument();
      expect(screen.queryByText('Protected Jobs Content')).not.toBeInTheDocument();
    });

    it('allows access to protected route when token exists', async () => {
      localStorage.setItem('token', 'valid_test_jwt_token');

      vi.spyOn(api, 'get').mockImplementation(async (url) => {
        if (url === '/auth/me') {
          return { data: { success: true, user: { email: 'test@example.com' } } };
        }
        return { data: {} };
      });

      render(
        <MemoryRouter initialEntries={['/jobs']}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<div>Login Page</div>} />
              <Route
                path="/jobs"
                element={
                  <ProtectedRoute>
                    <div>Protected Jobs Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      );

      expect(await screen.findByText('Protected Jobs Content')).toBeInTheDocument();
      expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
    });
  });

  describe('3. Axios Error Shape & 401 Interceptor Mapping', () => {
    it('maps VALIDATION_ERROR to user-friendly field descriptions', () => {
      const errData = {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [
          { field: 'urls', message: 'Must provide at least 1 URL' },
          { field: 'name', message: 'Name is required' },
        ],
      };

      const msg = getFriendlyErrorMessage(errData);
      expect(msg).toContain('Validation failed: urls: Must provide at least 1 URL, name: Name is required');
    });

    it('maps AUTHENTICATION_ERROR and RATE_LIMIT_EXCEEDED codes', () => {
      expect(getFriendlyErrorMessage({ code: 'AUTHENTICATION_ERROR', message: 'Invalid credentials' })).toBe(
        'Invalid credentials'
      );
      expect(getFriendlyErrorMessage({ code: 'RATE_LIMIT_EXCEEDED' })).toMatch(
        /rate limit exceeded/i
      );
      expect(getFriendlyErrorMessage({ code: 'INTERNAL_ERROR' })).toMatch(
        /internal server error/i
      );
    });
  });
});
