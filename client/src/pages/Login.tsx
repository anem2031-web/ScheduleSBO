import { useAuth } from "@/_core/hooks/useAuth";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

/**
 * صفحة تسجيل الدخول المحلية.
 * لو المستخدم مسجّل دخول بالفعل → تحويل مباشر إلى لوحة التحكم.
 */
export default function Login() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="rounded-xl border bg-background p-8 shadow-sm">
        <LoginForm />
      </div>
    </div>
  );
}
