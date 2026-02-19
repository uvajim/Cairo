"use client";

import dynamic from "next/dynamic";

// createBrowserRouter accesses `document` at module evaluation time, so the
// entire React Router tree must be excluded from SSR. ssr:false is only
// allowed inside a Client Component — hence this wrapper.
const AppRouter = dynamic(
  () => import("./AppRouter").then((m) => m.AppRouter),
  { ssr: false }
);

export function ClientOnly() {
  return <AppRouter />;
}
