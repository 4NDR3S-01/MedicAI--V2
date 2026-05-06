export {
  checkEmailAvailability,
  flushPendingProfileSync,
  getStoredSession,
  refreshStoredSession,
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
