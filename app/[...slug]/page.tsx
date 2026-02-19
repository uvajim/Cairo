import { ClientOnly } from "../components/ClientOnly";

// Catch-all so hard-refreshing any React Router path (/swap, /stock/AAPL, etc.)
// is served by Next.js without a 404.
export default function CatchAll() {
  return <ClientOnly />;
}
