"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/src/components/ui/Button";
import { Card } from "@/src/components/ui/Card";
import { Input } from "@/src/components/forms/Input";
import { Label } from "@/src/components/forms/Label";
import { ErrorMessage } from "@/src/components/forms/ErrorMessage";
import { authService } from "@/src/services/authService";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authService.sendPasswordReset(email);
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send a reset email.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-[calc(100dvh-5rem)] items-center justify-center p-6">
      <Card className="w-full max-w-md p-8" variant="solid">
        <h1 className="text-3xl font-medium text-[#325347]">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-[#414845]">Enter your account email and we’ll send a secure reset link.</p>
        {sent ? <p className="mt-6 rounded-2xl bg-[#c6ebda]/60 p-4 text-sm text-[#325347]" role="status">If an account exists for that email, a reset link is on its way.</p> : (
          <form className="mt-6 space-y-5" onSubmit={submit}>
            {error ? <ErrorMessage>{error}</ErrorMessage> : null}
            <div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></div>
            <Button className="w-full" isLoading={busy} type="submit">Send reset link</Button>
          </form>
        )}
        <Link className="mt-6 block text-center text-sm font-medium text-[#325347] underline" href="/auth/login">Back to sign in</Link>
      </Card>
    </div>
  );
}
