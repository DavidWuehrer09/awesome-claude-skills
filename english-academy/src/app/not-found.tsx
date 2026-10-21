import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl">Page not found</h1>
      <p className="mt-2 text-ink-2">This page does not exist, or it belongs to another account.</p>
      <Link className="mt-6 inline-flex h-10 items-center rounded-lg bg-navy px-4 font-medium text-navy-ink" href="/home">Go to Home</Link>
    </main>
  );
}
