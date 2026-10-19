/**
 * Local Authentication System Types
 * Independent from Manus OAuth
 */

export interface AuthenticatedUser {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  roles: string[]; // role codes like 'admin', 'hr_admin', etc.
  permissions: string[]; // permission codes like 'workers.read', 'payroll.approve'
  lastLoginAt: number | null;
  createdAt: number;
}

export interface SessionData {
  userId: number;
  sessionId: string;
  token: string;
  expiresAt: number;
  createdAt: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: AuthenticatedUser;
  sessionId?: string;
  token?: string;
  message?: string;
}

export interface PermissionCheck {
  hasPermission: boolean;
  reason?: string;
}
