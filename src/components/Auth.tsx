import React, { useState } from "react";
import { supabase, getRedirectUrl } from "../lib/supabase";
import { Sprout, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { ecoTheme as theme } from "../styles/theme";

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
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Check your email for the confirmation link!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Use the helper instead of window.location.origin
        redirectTo: getRedirectUrl(),
        // This is crucial for mobile: it keeps the login flow
        // inside the app rather than opening a random browser tab
        skipBrowserRedirect: false,
      },
    });

    if (error) console.error("Login Error:", error.message);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        backgroundColor: theme.colors.background,
        fontFamily: theme.fonts.ui,
      }}
    >
      {/* Background Organic Detail (Subtle Grain/Texture) */}
      <div className="absolute inset-0 opacity-5 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]" />

      <main
        className="relative w-full max-w-md p-10 backdrop-blur-md shadow-xl"
        style={{
          backgroundColor: theme.colors.glass,
          borderRadius: theme.radius.standard,
          boxShadow: `0 20px 25px -5px rgba(114, 90, 57, 0.12)`, // Tonal shadow tinted with Secondary
        }}
      >
        {/* Header - Editorial Style */}
        <header className="mb-10 text-center">
          <h1
            style={{ fontFamily: theme.fonts.display }}
            className="text-4xl font-medium tracking-tight mb-2 text-[#1A1C1B]"
          >
            Welcome to the Greenhouse
          </h1>
          <p className="text-sm opacity-70">
            {isSignUp
              ? "Create an account to start your smart gardening journey."
              : "Sign in to manage your ecosystem."}
          </p>
        </header>

        <form onSubmit={handleAuth} className="space-y-6">
          {/* Input Fields - Background Shift (No Borders) */}
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60 ml-1">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@eco-home.com"
                className="w-full p-4 transition-all focus:outline-none"
                style={{
                  backgroundColor: theme.colors.surfaceLow,
                  borderRadius: theme.radius.button,
                  color: theme.colors.onSurface,
                }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wider opacity-60 ml-1">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-4 transition-all focus:outline-none"
                style={{
                  backgroundColor: theme.colors.surfaceLow,
                  borderRadius: theme.radius.button,
                }}
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-xs rounded-xl font-bold border border-red-100">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 font-bold transition-transform hover:scale-[0.98]"
            style={{
              backgroundColor: theme.colors.primary,
              color: "#FFFFFF",
              borderRadius: theme.radius.button,
            }}
          >
            {loading ? (
              <div className="flex justify-center">
                {" "}
                <Loader2 />
              </div>
            ) : (
              <>{isSignUp ? "Create Account" : "Sign In"}</>
            )}
          </button>

          <div className="flex items-center gap-4 py-2">
            <div className="h-[1px] flex-grow bg-black/5" />
            <span className="text-xs uppercase opacity-40">or</span>
            <div className="h-[1px] flex-grow bg-black/5" />
          </div>
          <div className="w-full py-3 flex items-center justify-center gap-3">
            {/* Google Sign In Placeholder */}
            <button
              onClick={handleGoogleLogin}
              type="button"
              className="w-full py-3 flex items-center justify-center gap-3 border border-black/10 hover:bg-black/5 transition-colors"
              style={{ borderRadius: theme.radius.button }}
            >
              <img
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                className="w-5 h-5"
                alt="Google"
              />
              <span className="text-sm font-medium">Continue with Google</span>
            </button>
            {/* Biometric Placeholder */}
            {!isSignUp && (
              <button
                type="button"
                className="w-full py-3 flex items-center justify-center gap-3 border border-black/10 hover:bg-black/5 transition-colors"
                style={{ borderRadius: theme.radius.button }}
              >
                <span className="text-lg">☝️</span>
                <span className="text-sm font-medium">Use Biometrics</span>
              </button>
            )}
          </div>
        </form>

        <footer className="mt-8 text-center space-y-2">
          <button className="text-xs opacity-60 hover:opacity-100 transition-opacity">
            Forgot Password?
          </button>
          <div></div>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
          >
            {isSignUp
              ? "Already have an account? Sign In"
              : "Don't have an account? Sign Up"}
          </button>
        </footer>
      </main>
    </div>
  );
};
