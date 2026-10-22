"use client";
import { useState } from "react";
import { Button, ErrorNotice, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";

export function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        try {
          await api("/api/auth/login", { body: { password } });
          window.location.href = next;
        } catch (err) {
          setError(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <Field label="Password" htmlFor="password">
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </Field>
      {error && <ErrorNotice title="Could not sign in" message={error} />}
      <Button type="submit" loading={busy} className="w-full">Sign in</Button>
    </form>
  );
}
