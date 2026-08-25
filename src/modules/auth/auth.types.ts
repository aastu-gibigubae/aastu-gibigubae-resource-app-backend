import type { PublicUser } from '../users/users.types';

export interface SignupInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
  deviceFingerprint: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Signup and login both return this exact shape (SRS §8.5) — the only
// difference is which PublicUser fields the controller chooses to
// include (signup's example omits activation_status, login's includes
// it; both are the same underlying PublicUser, controller-level
// shaping, not two different types here).
export interface AuthResult extends TokenPair {
  user: PublicUser;
}