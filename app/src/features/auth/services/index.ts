export {
  checkEmailAvailability,
  flushPendingProfileSync,
  getStoredSession,
  refreshStoredSession,
  requestPasswordReset,
  signInWithEmail,
  signOut,
  onSessionExpired,
  validateStoredSession,
  SessionExpiredError,
  signUpWithProfile,
  updatePassword,
  validateEmailVerificationToken,
  validatePasswordResetToken,
  verifyEmailToken,
} from './auth.service';

export { clearRegisterDraft } from './registerDraft';

export type { AppAuthSession, AuthTokenValidationResponse, AuthTokenValidationStatus } from './auth.service';
