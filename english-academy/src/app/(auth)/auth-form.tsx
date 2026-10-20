"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        json: { email: f.get("email"), password: f.get("password"), ...(mode === "signup" ? { displayName: f.get("displayName") || undefined } : {}) },
      });
      const next = params.get("next");
      router.push(mode === "signup" ? "/onboarding" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/home");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h2 className="text-xl">{mode === "login" ? "Sign in" : "Create your account"}</h2>
        {error && <Notice tone="danger">{error}</Notice>}
        {mode === "signup" && (
          <Field label="Name (optional)" htmlFor="displayName">
            <Input id="displayName" name="displayName" autoComplete="given-name" maxLength={60} />
          </Field>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "signup" ? 10 : undefined} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={busy}>
          {mode === "login" ? "Sign in" : "Create account"}
        </Button>
        <p className="text-center text-sm text-ink-2">
          {mode === "login" ? <>New here? <Link className="text-navy underline" href="/signup">Create an account</Link></> : <>Already registered? <Link className="text-navy underline" href="/login">Sign in</Link></>}
        </p>
      </form>
    </Card>
  );
}
