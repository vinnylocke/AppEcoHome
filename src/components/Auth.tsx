import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import { Sprout, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { rhozlyTheme as theme } from "../styles/theme";
import { Logger } from "../lib/errorHandler";

import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core"; // 🚀 Added to detect platform

export const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      Logger.log(`Attempting ${isSignUp ? "sign up" : "sign in"} for ${email}`);

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        Logger.success("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        Logger.success("Welcome back!");
      }
    } catch (err: any) {
      Logger.error("Authentication error", err, { attemptedEmail: email });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      Logger.log("Starting Google OAuth login...");

      // 🚀 THE FIX: Dynamically set the redirect URL based on platform
      const isNative = Capacitor.isNativePlatform();
      const currentUrl = window.location.origin; // Grabs your local IP (e.g., http://192.168.1.XX:5173) or live domain

      const redirectUrl = isNative
        ? "com.rhozly.app://google-callback"
        : `${currentUrl}/`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          // Only skip browser redirect if we are on a native mobile app
          skipBrowserRedirect: isNative,
        },
      });

      if (error) throw error;

      if (isNative && data?.url) {
        await Browser.open({ url: data.url });
      }
      // If NOT native (e.g. PWA on tablet), Supabase handles the redirect automatically!
    } catch (err: any) {
      Logger.error(
        "Google Login Error",
        err,
        {},
        "Failed to sign in with Google. Please try again.",
      );
      setError(err.message);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        backgroundColor: theme.colors.background,
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Aesthetic Flourish: Floating Plants */}
      <div className="absolute top-10 -left-16 w-80 h-80 opacity-5 pointer-events-none rotate-12">
        <img
          src="https://images.unsplash.com/photo-1614594975525-e45190c55d40?q=80&w=400&auto=format&fit=crop"
          alt="Decorative leaf"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="absolute bottom-10 -right-20 w-96 h-96 opacity-5 pointer-events-none -rotate-12">
        <img
          src="https://images.unsplash.com/photo-1599598425947-33002629391b?q=80&w=400&auto=format&fit=crop"
          alt="Decorative fern"
          className="w-full h-full object-contain"
        />
      </div>

      <main className="w-full max-w-md z-10">
        {/* Brand Identity Section */}
        <div className="flex flex-col items-center mb-4">
          <div
            className="w-20 h-20 md:w-48 md:h-48 mb-2 rounded-full flex items-center justify-center overflow-hidden shadow-sm"
            style={{ backgroundColor: theme.colors.surfaceContainer }}
          >
            <div>
              <img
                src="/images/logo_small_rhozly.svg"
                alt="Rhozly"
                className="w-48 h-48 object-contain"
              />
            </div>
          </div>
          <h1
            className={theme.typography.heroTitle}
            style={{
              fontFamily: theme.fonts.display,
              color: theme.colors.primary,
            }}
          >
            Rhozly
          </h1>
          <p
            className={theme.typography.tagline}
            style={{ color: theme.colors.onSurface }}
          >
            Nurturing your digital arboretum
          </p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-[1.5rem] p-4 md:p-10 relative"
          style={{
            backgroundColor: theme.colors.surfaceContainerLowest,
            boxShadow: theme.shadows.ambient,
            border: `1px solid ${theme.colors.outlineVariant}`,
          }}
        >
          <h2
            className={`${theme.typography.heroTitle} font-bold mb-2 md:mb-8 text-center`}
            style={{
              fontFamily: theme.fonts.display,
              color: theme.colors.onSurface,
            }}
          >
            {isSignUp ? "Create an Account" : "Welcome Back"}
          </h2>

          <motion.form
            onSubmit={handleAuth}
            className="space-y-6"
            animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            {/* First Name Field */}
            {isSignUp && (
              <>
                <div>
                  <label
                    className="block text-xs font-bold uppercase tracking-widest opacity-70 mb-1 ml-1"
                    style={{ color: theme.colors.onSurface }}
                  >
                    First Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none opacity-40">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.colors.surfaceContainerLow,
                        color: theme.colors.onSurface,
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Last Name Field */}
            {isSignUp && (
              <>
                <div>
                  <label
                    className="block text-xs font-bold uppercase tracking-widest opacity-70 mb-1 ml-1"
                    style={{ color: theme.colors.onSurface }}
                  >
                    Last Name
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none opacity-40">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.colors.surfaceContainerLow,
                        color: theme.colors.onSurface,
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email Field */}
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-widest opacity-70 mb-1 ml-1"
                style={{ color: theme.colors.onSurface }}
              >
                Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none opacity-40">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@rhozly.com"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "auth-error" : undefined}
                  className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: theme.colors.surfaceContainerLow,
                    color: theme.colors.onSurface,
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label
                  className="block text-xs font-bold uppercase tracking-widest opacity-70 ml-1"
                  style={{ color: theme.colors.onSurface }}
                >
                  Password
                </label>
                {!isSignUp && (
                  <a
                    href="#"
                    className="text-xs font-bold transition-colors hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    Forgot Password?
                  </a>
                )}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none opacity-40">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={error ? "true" : "false"}
                  aria-describedby={error ? "auth-error" : undefined}
                  className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: theme.colors.surfaceContainerLow,
                    color: theme.colors.onSurface,
                  }}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                id="auth-error"
                role="alert"
                className="p-4 bg-red-50 text-red-600 text-xs rounded-xl font-bold border border-red-100"
              >
                {error}
              </div>
            )}

            {/* Primary Sign In Action */}
            <button
              type="submit"
              disabled={loading}
              className={`${theme.typography.signInButton} w-full text-white rounded-full font-bold shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200`}
              style={{
                background: theme.gradients.primary,
                fontFamily: theme.fonts.display,
              }}
            >
              {loading ? (
                <div className="flex justify-center">
                  <Loader2 className="animate-spin w-5 h-5" />
                </div>
              ) : (
                <>{isSignUp ? "Create Account" : "Sign In"}</>
              )}
            </button>
          </motion.form>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div
                className="w-full border-t"
                style={{ borderColor: theme.colors.surfaceContainerLow }}
              ></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span
                className="px-4 text-xs font-bold uppercase tracking-widest opacity-50"
                style={{
                  backgroundColor: theme.colors.surfaceContainerLowest,
                  color: theme.colors.onSurface,
                }}
              >
                Or continue with
              </span>
            </div>
          </div>

          {/* Social & Biometric Actions */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
              type="button"
              className={`${theme.typography.signInButton} w-full flex items-center justify-center gap-3 rounded-xl font-semibold transition-colors duration-200 active:scale-95`}
              style={{
                backgroundColor: theme.colors.surfaceContainerLow,
                color: theme.colors.onSurface,
              }}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                className="w-5 h-5"
                alt="Google"
              />
              <>{isSignUp ? "Sign Up using Google" : " Sign In with Google"}</>
            </button>

            {!isSignUp && (
              <button
                type="button"
                className={`${theme.typography.signInButton} w-full flex items-center justify-center gap-3 rounded-xl font-semibold transition-colors duration-200 active:scale-95`}
                style={{
                  backgroundColor: theme.colors.surfaceContainerLow,
                  color: theme.colors.onSurface,
                }}
              >
                <span className="text-lg">☝️</span>
                Use Biometrics
              </button>
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="mt-2 text-center">
          <p
            className="font-medium opacity-80"
            style={{ color: theme.colors.onSurface }}
          >
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-bold ml-2 hover:underline underline-offset-4"
              style={{ color: theme.colors.primary }}
            >
              {isSignUp ? "Sign In" : "Create Account"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
};
