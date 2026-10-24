"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, phone, password }),
      });

      const data = (await response.json()) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Registration failed.");
      }

      setMessage(
        data.message ?? "Account created. Email verification is the next step.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect to the server.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <form
        onSubmit={handleRegister}
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-2xl"
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
            MedCore HMS
          </p>
          <h1 className="mt-3 text-3xl font-bold">Create account</h1>
          <p className="mt-2 text-sm text-slate-400">
            Register as a patient to get started.
          </p>
        </div>

        <label className="block text-sm">
          Full name
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            placeholder="Your full name"
          />
        </label>

        <label className="block text-sm">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            placeholder="you@example.com"
          />
        </label>

        <label className="block text-sm">
          Phone (optional)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            placeholder="Phone number"
          />
        </label>

        <label className="block text-sm">
          Password
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
            placeholder="At least 8 characters"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-red-950 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        ) : null}

        {message ? (
          <p
            role="status"
            className="rounded-lg bg-emerald-950 p-3 text-sm text-emerald-300"
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-500 p-3 font-semibold text-slate-950 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create patient account"}
        </button>

        <p className="text-center text-sm text-slate-400">
          Already registered?{" "}
          <Link
            href="/"
            className="font-semibold text-cyan-400 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </form>
    </main>
  );
}
