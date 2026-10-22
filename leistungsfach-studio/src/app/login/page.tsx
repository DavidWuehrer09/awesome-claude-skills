import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="font-serif text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">This studio is private. Enter the password set in <code>APP_PASSWORD</code>.</p>
      <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
    </div>
  );
}
