import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, Lock, Mail } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { MIN_PASSWORD_LENGTH } from "@shared/access-control";
import { useLanguage } from "@/lib/i18n";

/**
 * نموذج تسجيل الدخول المحلي (Email + Password).
 * عند النجاح: يحدّث كاش auth.me وينتقل إلى لوحة التحكم.
 */
export function LoginForm() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { language } = useLanguage();
  const copy = {
    ar: { title: "تسجيل الدخول", identifier: "اسم الدخول أو البريد الإلكتروني", password: "كلمة المرور", missing: "أدخل اسم الدخول وكلمة المرور", short: "كلمة المرور قصيرة. أدخل 7 خانات على الأقل؛ أرقام أو حروف أو كليهما.", enter: "دخول", busy: "جارٍ تسجيل الدخول..." },
    en: { title: "Sign in", identifier: "Username or email", password: "Password", missing: "Enter your username and password", short: "Use at least 7 characters. Numbers, letters, or both are accepted.", enter: "Sign in", busy: "Signing in..." },
    ur: { title: "لاگ ان", identifier: "صارف نام یا ای میل", password: "پاس ورڈ", missing: "صارف نام اور پاس ورڈ درج کریں", short: "کم از کم 7 حروف درج کریں۔ اعداد، حروف یا دونوں استعمال کر سکتے ہیں۔", enter: "لاگ ان", busy: "لاگ ان ہو رہا ہے..." },
  }[language];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      utils.auth.me.setData(undefined, data.user);
      await utils.auth.me.invalidate();
      navigate("/dashboard");
    },
    onError: (error) => {
      setErrorMessage(error.message || "تعذّر تسجيل الدخول");
    },
  });

  const handleSubmit = () => {
    setErrorMessage(null);
    if (!email.trim() || !password) {
      setErrorMessage(copy.missing);
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) return setErrorMessage(copy.short);
    loginMutation.mutate({ email: email.trim(), password });
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">
          منصة إدارة القوى العاملة
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{copy.identifier}</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="text"
              dir="ltr"
              autoComplete="username"
              placeholder="ADMIN"
              className="pr-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={loginMutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{copy.password}</Label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              placeholder="••••••••"
              className="pr-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={loginMutation.isPending}
            />
          </div>
        </div>

        {errorMessage && (
          <p className="text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        )}

        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              {copy.busy}
            </>
          ) : (
            copy.enter
          )}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        لا تملك حسابًا؟ تواصل مع مسؤول النظام لإنشاء حساب لك.
      </p>
    </div>
  );
}
