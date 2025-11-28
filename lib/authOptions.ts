/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import dbConnect from "./mongodb";
import User from "./models/User";
import jwt from "jsonwebtoken";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      // On initial sign in, user will be defined. Ensure user exists in DB and attach DB id
      if (user?.email) {
        await dbConnect();
        // Try to find an existing user by email
        let dbUser = await User.findOne({ email: user.email });
        if (!dbUser) {
          dbUser = new User({
            name: user.name || "",
            email: user.email,
            isGuest: false,
          });
          await dbUser.save();
        }
        // Attach internal DB id to token
        (token as any).userId = dbUser._id.toString();
        // Create an application JWT so the Apollo GraphQL layer can authenticate with existing logic
        (token as any).appJwt = jwt.sign(
          { userId: token.userId },
          process.env.JWT_SECRET || "fallback_secret",
          { expiresIn: "30d" }
        );
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      // Copy DB id into session so client can read it
      if (session.user && (token as any)?.userId) {
        (session.user as any).id = (token as any).userId;
      }
      if (session.user && (token as any)?.appJwt) {
        (session.user as any).appJwt = (token as any).appJwt;
      }
      return session;
    },
  },
};

export default authOptions;
