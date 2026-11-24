import { ValidationError, ConflictError } from '@scraper/shared';
import { User } from '../../models/User.js';
import { logger } from '../../utils/logger.js';

/**
 * Handles account lookup, linking, or creation for an OAuth profile.
 */
export async function handleOAuthAccount({
  provider,
  providerId,
  email,
  isEmailVerified = false,
  name = '',
  avatarUrl = '',
  userModel = User,
}) {
  if (!email || typeof email !== 'string' || !email.trim()) {
    throw new ValidationError('NO_EMAIL_PROVIDED');
  }

  const normalizedEmail = email.trim().toLowerCase();

  // 1. Check if user already has this provider connected
  let user = await userModel.findOne({
    providers: {
      $elemMatch: { provider, providerId },
    },
  });

  if (user) {
    let shouldSave = false;
    if (!user.name && name) {
      user.name = name;
      shouldSave = true;
    }
    if (!user.avatarUrl && avatarUrl) {
      user.avatarUrl = avatarUrl;
      shouldSave = true;
    }
    if (shouldSave) {
      await user.save();
    }
    return { user, isNew: false, linked: false };
  }

  // 2. Check if a user with the same email already exists
  const existingUser = await userModel.findOne({ email: normalizedEmail });

  if (existingUser) {
    if (!existingUser.isEmailVerified || !isEmailVerified) {
      logger.warn(
        { email: normalizedEmail, existingVerified: existingUser.isEmailVerified, oauthVerified: isEmailVerified },
        'Rejecting account link: email is not verified on both sides'
      );
      throw new ConflictError('UNVERIFIED_EMAIL_LINK_REJECTED');
    }

    existingUser.providers.push({ provider, providerId });
    if (!existingUser.name && name) existingUser.name = name;
    if (!existingUser.avatarUrl && avatarUrl) existingUser.avatarUrl = avatarUrl;
    await existingUser.save();

    logger.info({ userId: existingUser._id, provider }, 'Successfully linked OAuth provider to existing user');
    return { user: existingUser, isNew: false, linked: true };
  }

  // 3. Create new user
  user = await userModel.create({
    email: normalizedEmail,
    isEmailVerified: Boolean(isEmailVerified),
    name: name || '',
    avatarUrl: avatarUrl || '',
    providers: [{ provider, providerId }],
  });

  logger.info({ userId: user._id, provider }, 'Created new user via OAuth');
  return { user, isNew: true, linked: false };
}
