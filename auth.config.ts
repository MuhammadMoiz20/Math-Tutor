import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no Node-only imports here.
// Used by middleware. The Credentials provider lives in auth.ts.
export const authConfig = {
  pages: {
    signIn: "/signin",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isAuthPage = pathname.startsWith("/signin");
      if (isAuthPage) return true;
      // Protect everything else by default in middleware matcher.
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string | number }).id?.toString();
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as { id?: string }).id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
