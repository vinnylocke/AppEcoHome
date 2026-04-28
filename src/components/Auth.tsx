import React, { useState, useRef } from "react";
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);

  // Refs for focus management
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const validateFields = (): boolean => {
    const errors: Record<string, string> = {};
    if (isSignUp && !firstName.trim()) errors.firstName = "First name is required.";
    if (isSignUp && !lastName.trim()) errors.lastName = "Last name is required.";
    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (isSignUp && password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!email.trim()) {
      setFieldErrors({ email: "Please enter your email address to reset your password." });
      setLoading(false);
      emailRef.current?.focus();
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotPasswordSent(true);
    } catch (err: any) {
      Logger.error("Password reset error", err, { attemptedEmail: email });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    if (!validateFields()) {
      if (isSignUp && fieldErrors.firstName) {
        firstNameRef.current?.focus();
      } else if (isSignUp && fieldErrors.lastName) {
        lastNameRef.current?.focus();
      } else if (fieldErrors.email) {
        emailRef.current?.focus();
      } else if (fieldErrors.password) {
        passwordRef.current?.focus();
      }
      return;
    }
    setLoading(true);
    setError(null);

    try {
      Logger.log(`Attempting ${isSignUp ? "sign up" : "sign in"} for ${email}`);

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
            },
          },
        });
        if (error) throw error;

        setSuccessMessage("Account created! Check your email for a confirmation link.");
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

      // Focus management: focus the first invalid field
      if (isSignUp && !firstName) {
        firstNameRef.current?.focus();
      } else if (isSignUp && !lastName) {
        lastNameRef.current?.focus();
      } else if (!email) {
        emailRef.current?.focus();
      } else if (!password) {
        passwordRef.current?.focus();
      } else {
        emailRef.current?.focus();
      }
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

          {isForgotPassword ? (
            forgotPasswordSent ? (
              <div
                role="status"
                aria-live="polite"
                className="p-4 rounded-xl text-sm font-semibold text-center"
                style={{ backgroundColor: "#d1fae5", color: theme.colors.primary }}
              >
                Password reset email sent. Check your inbox and follow the link to reset your password.
                <button
                  onClick={() => { setIsForgotPassword(false); setForgotPasswordSent(false); }}
                  className="block w-full mt-3 text-xs font-bold underline underline-offset-4 hover:opacity-80 transition-opacity"
                  style={{ color: theme.colors.primary }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <motion.form
                onSubmit={handleForgotPassword}
                className="space-y-6"
                animate={error ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
              >
                <p className="text-sm opacity-70 text-center" style={{ color: theme.colors.onSurface }}>
                  Enter your email and we'll send you a link to reset your password.
                </p>
                <div>
                  <label
                    className="block text-xs font-bold uppercase tracking-widest opacity-70 mb-1 ml-1"
                    style={{ color: theme.colors.onSurface }}
                  >
                    Email
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none opacity-40">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="20" height="16" x="2" y="4" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <input
                      ref={emailRef}
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: "" })); }}
                      placeholder="hello@rhozly.com"
                      aria-invalid={!!fieldErrors.email ? "true" : "false"}
                      aria-describedby={fieldErrors.email ? "field-error-email" : undefined}
                      className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.colors.surfaceContainerLow,
                        color: theme.colors.onSurface,
                        "--tw-ring-color": theme.colors.primary,
                      } as React.CSSProperties}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p id="field-error-email" className="mt-1 ml-1 text-xs font-semibold text-red-600">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
                {error && (
                  <div id="auth-error" role="alert" aria-live="assertive" className="p-4 bg-red-50 text-red-600 text-xs rounded-xl font-bold border border-red-100">
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={`${theme.typography.signInButton} min-h-[44px] w-full text-white rounded-xl font-bold shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200`}
                  style={{ background: theme.gradients.primary, fontFamily: theme.fonts.display }}
                >
                  {loading ? <div className="flex justify-center"><Loader2 className="animate-spin w-5 h-5" /></div> : "Send Reset Link"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsForgotPassword(false); setError(null); setFieldErrors({}); }}
                  className="w-full text-xs font-bold underline underline-offset-4 hover:opacity-80 transition-opacity"
                  style={{ color: theme.colors.onSurface }}
                >
                  Back to Sign In
                </button>
              </motion.form>
            )
          ) : (
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
                      ref={firstNameRef}
                      type="text"
                      value={firstName}
                      onChange={(e) => { setFirstName(e.target.value); setFieldErrors((prev) => ({ ...prev, firstName: "" })); }}
                      aria-invalid={!!fieldErrors.firstName ? "true" : "false"}
                      aria-describedby={fieldErrors.firstName ? "field-error-firstName" : undefined}
                      className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.colors.surfaceContainerLow,
                        color: theme.colors.onSurface,
                        "--tw-ring-color": theme.colors.primary,
                      } as React.CSSProperties}
                    />
                  </div>
                  {fieldErrors.firstName && (
                    <p id="field-error-firstName" className="mt-1 ml-1 text-xs font-semibold text-red-600">
                      {fieldErrors.firstName}
                    </p>
                  )}
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
                      ref={lastNameRef}
                      type="text"
                      value={lastName}
                      onChange={(e) => { setLastName(e.target.value); setFieldErrors((prev) => ({ ...prev, lastName: "" })); }}
                      aria-invalid={!!fieldErrors.lastName ? "true" : "false"}
                      aria-describedby={fieldErrors.lastName ? "field-error-lastName" : undefined}
                      className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                      style={{
                        backgroundColor: theme.colors.surfaceContainerLow,
                        color: theme.colors.onSurface,
                        "--tw-ring-color": theme.colors.primary,
                      } as React.CSSProperties}
                    />
                  </div>
                  {fieldErrors.lastName && (
                    <p id="field-error-lastName" className="mt-1 ml-1 text-xs font-semibold text-red-600">
                      {fieldErrors.lastName}
                    </p>
                  )}
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
                  ref={emailRef}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: "" })); }}
                  placeholder="hello@rhozly.com"
                  aria-invalid={!!fieldErrors.email ? "true" : "false"}
                  aria-describedby={fieldErrors.email ? "field-error-email" : undefined}
                  className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: theme.colors.surfaceContainerLow,
                    color: theme.colors.onSurface,
                    "--tw-ring-color": theme.colors.primary,
                  } as React.CSSProperties}
                />
              </div>
              {fieldErrors.email && (
                <p id="field-error-email" className="mt-1 ml-1 text-xs font-semibold text-red-600">
                  {fieldErrors.email}
                </p>
              )}
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
                  <button
                    type="button"
                    onClick={() => { setIsForgotPassword(true); setError(null); setFieldErrors({}); }}
                    className="text-xs font-bold transition-colors hover:opacity-80"
                    style={{ color: theme.colors.primary }}
                  >
                    Forgot Password?
                  </button>
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
                  ref={passwordRef}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: "" })); }}
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.password ? "true" : "false"}
                  aria-describedby={fieldErrors.password ? "field-error-password" : undefined}
                  className="block w-full pl-11 pr-4 py-4 focus:ring-2 focus:outline-none rounded-xl transition-all duration-200"
                  style={{
                    backgroundColor: theme.colors.surfaceContainerLow,
                    color: theme.colors.onSurface,
                    "--tw-ring-color": theme.colors.primary,
                  } as React.CSSProperties}
                />
              </div>
              {fieldErrors.password && (
                <p id="field-error-password" className="mt-1 ml-1 text-xs font-semibold text-red-600">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Success Message */}
            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                className="p-4 rounded-xl text-xs font-bold border"
                style={{ backgroundColor: "#d1fae5", color: theme.colors.primary, borderColor: "#6ee7b7" }}
              >
                {successMessage}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                id="auth-error"
                role="alert"
                aria-live="assertive"
                className="p-4 bg-red-50 text-red-600 text-xs rounded-xl font-bold border border-red-100"
              >
                {error}
              </div>
            )}

            {/* Primary Sign In Action */}
            <button
              type="submit"
              disabled={loading}
              className={`${theme.typography.signInButton} min-h-[44px] w-full text-white rounded-xl font-bold shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200`}
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
          )}

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
              className={`${theme.typography.signInButton} min-h-[44px] w-full flex items-center justify-center gap-3 rounded-xl font-semibold transition-colors duration-200 active:scale-95 focus:ring-2 focus:outline-none`}
              style={{
                backgroundColor: theme.colors.surfaceContainerLow,
                color: theme.colors.onSurface,
                "--tw-ring-color": theme.colors.primary,
              } as React.CSSProperties}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                className="w-5 h-5"
                alt="Google"
              />
              <>{isSignUp ? "Sign Up with Google" : "Sign In with Google"}</>
            </button>

            {/* Biometrics button hidden until implementation is ready */}
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
