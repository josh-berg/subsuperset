import { expo } from "@better-auth/expo";
import { db } from "@superset/db/client";
import * as authSchema from "@superset/db/schema/auth";
import { getTrustedVercelPreviewOrigins } from "@superset/shared/vercel-preview-origins";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, customSession } from "better-auth/plugins";
import { env } from "./env";

const desktopDevPort = process.env.DESKTOP_VITE_PORT || "5173";
const desktopDevOrigins =
	process.env.NODE_ENV === "development"
		? [
				`http://localhost:${desktopDevPort}`,
				`http://127.0.0.1:${desktopDevPort}`,
			]
		: [];

export const auth = betterAuth({
	baseURL: env.NEXT_PUBLIC_API_URL,
	secret: env.BETTER_AUTH_SECRET,
	disabledPaths: [],
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema: authSchema,
	}),
	trustedOrigins: async (request) => [
		env.NEXT_PUBLIC_WEB_URL,
		env.NEXT_PUBLIC_API_URL,
		env.NEXT_PUBLIC_MARKETING_URL,
		env.NEXT_PUBLIC_ADMIN_URL,
		...(env.NEXT_PUBLIC_DESKTOP_URL ? [env.NEXT_PUBLIC_DESKTOP_URL] : []),
		...getTrustedVercelPreviewOrigins(request?.url ?? env.NEXT_PUBLIC_API_URL),
		...desktopDevOrigins,
		"superset://app",
		"superset://",
		...(process.env.NODE_ENV === "development"
			? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
			: []),
	],
	session: {
		expiresIn: 60 * 60 * 24 * 30,
		updateAge: 60 * 60 * 24,
		storeSessionInDatabase: true,
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5,
		},
	},
	advanced: {
		crossSubDomainCookies: {
			enabled: true,
			domain: env.NEXT_PUBLIC_COOKIE_DOMAIN,
		},
		database: {
			generateId: false,
		},
	},
	socialProviders: {
		github: {
			clientId: env.GH_CLIENT_ID,
			clientSecret: env.GH_CLIENT_SECRET,
		},
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	plugins: [
		expo(),
		bearer(),
		customSession(async ({ user, session }) => {
			return { user, session };
		}),
	],
});

export type Session = typeof auth.$Infer.Session;
export type User = typeof auth.$Infer.Session.user;
