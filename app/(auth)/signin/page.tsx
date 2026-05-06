import { signIn } from "@/auth";

export default function SignInPage() {
  async function action(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: "/",
      });
    } catch (err) {
      // NextAuth throws a redirect error on success; rethrow so Next handles it.
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      // For credential failures, NextAuth re-throws too; fall through to /signin?error=
      throw err;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded border px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-black px-3 py-2 text-white hover:bg-gray-800"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}

