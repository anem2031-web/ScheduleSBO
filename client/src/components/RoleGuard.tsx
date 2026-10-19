import { ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { permits } from "@shared/access-control";

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: string[];
  fallback?: ReactNode;
  permission?: string;
}

/**
 * مكون حماية الأدوار
 * يعرض المحتوى فقط للمستخدمين الذين لديهم الأدوار المسموحة
 */
export function RoleGuard({ children, allowedRoles, fallback, permission }: RoleGuardProps) {
  const { user } = useAuth();

  if (!user) {
    return fallback || null;
  }

  if (!allowedRoles.includes(user.role) || (permission && !permits(user.permissions ?? [], permission))) {
    return fallback || null;
  }

  return <>{children}</>;
}

/**
 * مكون حماية الأزرار حسب الدور
 * يعطل الزر إذا لم يكن للمستخدم الصلاحية المطلوبة
 */
export function RoleGuardButton({
  children,
  allowedRoles,
  disabled = false,
  permission,
  ...props
}: {
  children: ReactNode;
  allowedRoles: string[];
  disabled?: boolean;
  permission?: string;
  [key: string]: any;
}) {
  const { user } = useAuth();

  const isAllowed = user && allowedRoles.includes(user.role) && (!permission || permits(user.permissions ?? [], permission));
  const isDisabled = !isAllowed || disabled;

  return (
    <button
      disabled={isDisabled}
      title={!isAllowed ? "ليس لديك صلاحية لهذا الإجراء" : ""}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Hook للتحقق من صلاحيات المستخدم
 */
export function useHasRole(allowedRoles: string[]): boolean {
  const { user } = useAuth();
  return user ? allowedRoles.includes(user.role) : false;
}

/**
 * Hook للتحقق من صلاحية محددة
 */
export function useHasPermission(permission: string): boolean {
  const { user } = useAuth();

  if (!user) return false;

  return permits(user.permissions ?? [], permission);
}
