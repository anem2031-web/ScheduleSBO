import "@fontsource/cairo/400.css";
import "@fontsource/cairo/500.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import { displayLanguage } from "@shared/display-format";
import { currentLanguage } from "./lib/i18n";
import { productSignature } from "@shared/brand";

import App from "./App";
import { startLogin } from "./const";
import "./index.css";

/*
 * إعدادات الهوية العامة:
 * - اللغة العربية
 * - اتجاه RTL
 * - الوضع الداكن المعتمد
 *
 * نضيف dark إلى html حتى تعمل تنسيقات النوافذ
 * المنبثقة والقوائم التي تُعرض مباشرة داخل body.
 */
const documentElement = document.documentElement;

const initialLanguage = currentLanguage();
documentElement.lang = displayLanguage(initialLanguage);
documentElement.dir = initialLanguage === "en" ? "ltr" : "rtl";
document.title = productSignature(initialLanguage);
documentElement.classList.add("dark");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: {
      retry: false,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) {
    return;
  }

  if (typeof window === "undefined") {
    return;
  }

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) {
    return;
  }

  startLogin();
};

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;

    redirectToLoginIfUnauthorized(error);

    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;

    redirectToLoginIfUnauthorized(error);

    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,

      headers() {
        try {
          const raw = sessionStorage.getItem("manus-cookie");

          if (!raw) {
            return {};
          }

          const prefix = `${COOKIE_NAME}=`;

          const cookiePair = raw
            .split(";")
            .find((value) => value.trim().startsWith(prefix));

          const token = cookiePair?.trim().slice(prefix.length);

          if (!token) {
            return {};
          }

          return {
            Authorization: `Bearer ${token}`,
          };
        } catch {
          return {};
        }
      },

      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("تعذر العثور على عنصر root لتشغيل التطبيق.");
}

createRoot(rootElement).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>,
);
