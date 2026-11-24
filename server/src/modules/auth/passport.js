import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { handleOAuthAccount } from './accountService.js';
import { logger } from '../../utils/logger.js';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:5000';

// Configure Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder_google_id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder_google_secret',
      callbackURL: `${SERVER_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const primaryEmailObj =
          profile.emails?.find((e) => e.verified === true || e.verified === 'true') ||
          profile.emails?.[0];

        const email = primaryEmailObj?.value;
        const isEmailVerified =
          primaryEmailObj?.verified === true || primaryEmailObj?.verified === 'true';
        const name =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
        const avatarUrl = profile.photos?.[0]?.value || '';

        const { user } = await handleOAuthAccount({
          provider: 'google',
          providerId: profile.id,
          email,
          isEmailVerified,
          name,
          avatarUrl,
        });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Configure GitHub Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID || 'placeholder_github_id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'placeholder_github_secret',
      callbackURL: `${SERVER_URL}/auth/github/callback`,
      scope: ['user:email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let email = null;
        let isEmailVerified = false;

        if (profile.emails && profile.emails.length > 0) {
          const verifiedEmail = profile.emails.find((e) => e.verified);
          const primaryEmail = profile.emails.find((e) => e.primary);
          const chosen = verifiedEmail || primaryEmail || profile.emails[0];
          if (chosen) {
            email = chosen.value;
            isEmailVerified = Boolean(chosen.verified);
          }
        }

        // If email is still null, fetch from GitHub API /user/emails
        if (!email && accessToken) {
          try {
            const response = await fetch('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'FireCrawl-OAuth',
                Accept: 'application/vnd.github.v3+json',
              },
            });

            if (response.ok) {
              const emails = await response.json();
              if (Array.isArray(emails)) {
                const primaryVerified = emails.find((e) => e.primary && e.verified);
                const verified = emails.find((e) => e.verified);
                const primary = emails.find((e) => e.primary);
                const chosen = primaryVerified || verified || primary || emails[0];
                if (chosen) {
                  email = chosen.email;
                  isEmailVerified = Boolean(chosen.verified);
                }
              }
            }
          } catch (fetchErr) {
            logger.warn({ err: fetchErr.message }, 'Failed to fetch GitHub user emails from API');
          }
        }

        const name = profile.displayName || profile.username || '';
        const avatarUrl = profile.photos?.[0]?.value || profile._json?.avatar_url || '';

        const { user } = await handleOAuthAccount({
          provider: 'github',
          providerId: profile.id,
          email,
          isEmailVerified,
          name,
          avatarUrl,
        });

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;
