export {
  checkEmailAvailability,
  flushPendingProfileSync,
  getStoredSession,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  signUpWithProfile,
  updatePassword,
  validateEmailVerificationToken,
  validatePasswordResetToken,
  verifyEmailToken,
} from './auth.service';

export type { AppAuthSession, AuthTokenValidationResponse, AuthTokenValidationStatus } from './auth.service';
