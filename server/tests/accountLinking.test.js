import { describe, it, expect, beforeEach } from '@jest/globals';
import { handleOAuthAccount } from '../src/modules/auth/accountService.js';

describe('OAuth Account Linking Logic', () => {
  let mockUsers = [];

  // Mock UserModel to test database interactions in isolation
  const mockUserModel = {
    findOne: async (query) => {
      if (query.providers?.$elemMatch) {
        const { provider, providerId } = query.providers.$elemMatch;
        return (
          mockUsers.find((u) =>
            u.providers.some(
              (p) => p.provider === provider && p.providerId === providerId
            )
          ) || null
        );
      }
      if (query.email) {
        return mockUsers.find((u) => u.email === query.email) || null;
      }
      return null;
    },
    create: async (data) => {
      const newUser = {
        _id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        ...data,
        save: async function () {
          return this;
        },
      };
      mockUsers.push(newUser);
      return newUser;
    },
  };

  beforeEach(() => {
    mockUsers = [];
  });

  it('creates a new user when no matching provider or email exists', async () => {
    const result = await handleOAuthAccount({
      provider: 'google',
      providerId: 'google-12345',
      email: 'newuser@example.com',
      isEmailVerified: true,
      name: 'New User',
      avatarUrl: 'https://example.com/avatar.jpg',
      userModel: mockUserModel,
    });

    expect(result.isNew).toBe(true);
    expect(result.linked).toBe(false);
    expect(result.user.email).toBe('newuser@example.com');
    expect(result.user.isEmailVerified).toBe(true);
    expect(result.user.providers).toHaveLength(1);
    expect(result.user.providers[0]).toEqual({
      provider: 'google',
      providerId: 'google-12345',
    });
  });

  it('returns existing user when provider and providerId match', async () => {
    // Seed existing user
    const existing = await mockUserModel.create({
      email: 'existing@example.com',
      isEmailVerified: true,
      providers: [{ provider: 'github', providerId: 'gh-999' }],
      name: 'Existing GH User',
    });

    const result = await handleOAuthAccount({
      provider: 'github',
      providerId: 'gh-999',
      email: 'existing@example.com',
      isEmailVerified: true,
      name: 'Updated Name',
      userModel: mockUserModel,
    });

    expect(result.isNew).toBe(false);
    expect(result.linked).toBe(false);
    expect(result.user._id).toBe(existing._id);
    expect(mockUsers).toHaveLength(1);
  });

  it('links provider to existing user when email is verified on both sides', async () => {
    // Existing user registered via email and verified
    const existing = await mockUserModel.create({
      email: 'verified@example.com',
      isEmailVerified: true,
      providers: [],
      name: 'Email User',
    });

    const result = await handleOAuthAccount({
      provider: 'google',
      providerId: 'google-888',
      email: 'verified@example.com',
      isEmailVerified: true,
      name: 'Google User',
      avatarUrl: 'https://example.com/pic.png',
      userModel: mockUserModel,
    });

    expect(result.isNew).toBe(false);
    expect(result.linked).toBe(true);
    expect(result.user._id).toBe(existing._id);
    expect(result.user.providers).toContainEqual({
      provider: 'google',
      providerId: 'google-888',
    });
    expect(mockUsers).toHaveLength(1);
  });

  it('rejects linking if existing user email is unverified', async () => {
    // Existing unverified account
    await mockUserModel.create({
      email: 'unverified@example.com',
      isEmailVerified: false,
      providers: [],
    });

    await expect(
      handleOAuthAccount({
        provider: 'google',
        providerId: 'google-456',
        email: 'unverified@example.com',
        isEmailVerified: true,
        userModel: mockUserModel,
      })
    ).rejects.toThrow('UNVERIFIED_EMAIL_LINK_REJECTED');
  });

  it('rejects linking if incoming OAuth email is unverified', async () => {
    // Existing verified account
    await mockUserModel.create({
      email: 'target@example.com',
      isEmailVerified: true,
      providers: [],
    });

    await expect(
      handleOAuthAccount({
        provider: 'github',
        providerId: 'gh-123',
        email: 'target@example.com',
        isEmailVerified: false, // unverified on GitHub
        userModel: mockUserModel,
      })
    ).rejects.toThrow('UNVERIFIED_EMAIL_LINK_REJECTED');
  });

  it('throws an error if OAuth account provides no usable email', async () => {
    await expect(
      handleOAuthAccount({
        provider: 'github',
        providerId: 'gh-no-email',
        email: null,
        isEmailVerified: false,
        userModel: mockUserModel,
      })
    ).rejects.toThrow('NO_EMAIL_PROVIDED');

    await expect(
      handleOAuthAccount({
        provider: 'google',
        providerId: 'google-empty-email',
        email: '   ',
        isEmailVerified: false,
        userModel: mockUserModel,
      })
    ).rejects.toThrow('NO_EMAIL_PROVIDED');
  });
});
