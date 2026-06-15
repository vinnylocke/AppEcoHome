import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Sprout, Loader2, CheckCircle2, AlertCircle, ArrowRight, Mail } from "lucide-react";
import { supabase } from "../lib/supabase";
import { logEvent, EVENT } from "../events/registry";
import { Logger } from "../lib/errorHandler";

// UX review 2026-06-15 item 5.1 — invite redemption landing page.
//
// Mounted at /join/:token (App.tsx). Two paths:
//
//   * Signed in → POST redeem-home-invite immediately. On success route
//     to /dashboard (the user's profile.home_id will be set by the
//     normal home-switch flow on first load).
//   * Signed out → stash the token in localStorage + bounce to /auth.
//     After sign-in the AuthGate effect inside App.tsx picks the
//     stashed token up and redeems it.

type RedeemError =
  | "invite_not_found"
  | "invite_already_used"
  | "invite_expired"
  | "email_mismatch"
  | "no_email_on_account"
  | "no_token"
  | "unknown";

interface RedeemErrorPayload {
  code: RedeemError;
  message?: string;
  invitee?: string;
}

const LS_KEY = "rhozly_pending_invite_token";

export function stashInviteToken(token: string): void {
  try {
    localStorage.setItem(LS_KEY, token);
  } catch { /* private mode / SSR */ }
}

export function readStashedInviteToken(): string | null {
  try {
    return localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

export function clearStashedInviteToken(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

export default function JoinHomeViaToken() {
  const { token: paramToken } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "redeeming" | "needs-signin" | "success" | "error">("checking");
  const [redeemError, setRedeemError] = useState<RedeemErrorPayload | null>(null);
  const [resolvedHomeId, setResolvedHomeId] = useState<string | null>(null);
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    const token = paramToken?.trim() ?? null;
    if (!token) {
      setRedeemError({ code: "no_token" });
      setState("error");
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Stash token + bounce to auth. We don't auto-redirect here so
        // the user sees the "you've been invited" framing first.
        stashInviteToken(token);
        setState("needs-signin");
        return;
      }
      setState("redeeming");
      try {
        const { data, error } = await supabase.functions.invoke("redeem-home-invite", {
          body: { token },
        });
        if (error) throw error;
        if (data?.error) {
          const code = (data.error as RedeemError) ?? "unknown";
          setRedeemError({ code, message: data.message, invitee: data.invitee });
          setState("error");
          if (code === "invite_expired") {
            logEvent(EVENT.INVITE_EXPIRED, { token });
          }
          return;
        }
        clearStashedInviteToken();
        setResolvedHomeId(data?.home_id ?? null);
        setState("success");
        logEvent(EVENT.INVITE_REDEEMED, {
          home_id: data?.home_id ?? null,
          role: data?.role ?? null,
          alreadyMember: !!data?.alreadyMember,
        });
      } catch (err: any) {
        Logger.error("Redeem invite failed", err);
        setRedeemError({ code: "unknown", message: err?.message ?? "Something went wrong." });
        setState("error");
      }
    })();
  }, [paramToken]);

  const goToDashboard = () => {
    navigate("/dashboard", { replace: true });
  };

  const goToSignIn = () => {
    // App.tsx renders <Auth /> at the top level when there's no session,
    // so a navigate to "/" with no session lands the user on the auth
    // screen. The stashed token survives the round-trip.
    navigate("/", { replace: true });
  };

  return (
    <div
      data-testid="join-home-via-token"
      className="min-h-screen w-full bg-gradient-to-br from-rhozly-bg via-emerald-50/40 to-rhozly-bg flex items-center justify-center p-4"
    >
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-rhozly-outline/10 overflow-hidden">
        <div
          className="px-6 pt-7 pb-5 text-white"
          style={{ background: "linear-gradient(135deg, #2d6a4f 0%, #52b788 100%)" }}
        >
          <div className="flex items-center gap-2.5 mb-1">
            <Sprout size={20} />
            <span className="font-display font-black text-lg tracking-tight">Rhozly</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">You've been invited</h1>
          <p className="text-sm text-white/85 font-bold mt-1">
            Accept the invite to join a shared garden.
          </p>
        </div>

        <div className="p-6 min-h-[200px] flex flex-col items-center justify-center text-center gap-4">
          {state === "checking" || state === "redeeming" ? (
            <>
              <Loader2 size={28} className="animate-spin text-rhozly-primary" />
              <p className="text-sm font-bold text-rhozly-on-surface/65">
                {state === "checking" ? "Looking up your invite…" : "Joining the garden…"}
              </p>
            </>
          ) : state === "needs-signin" ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary flex items-center justify-center">
                <Mail size={20} />
              </div>
              <p className="text-sm font-bold text-rhozly-on-surface leading-relaxed">
                Sign in (or sign up) with the email address this invite was sent to. We'll add you to the garden as soon as you're in.
              </p>
              <button
                data-testid="join-home-signin"
                onClick={goToSignIn}
                className="inline-flex items-center gap-2 bg-rhozly-primary text-white px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black hover:opacity-90 transition shadow-sm"
              >
                Sign in to continue <ArrowRight size={14} />
              </button>
              <p className="text-[11px] font-bold text-rhozly-on-surface/40 leading-snug">
                Your invite is safe — we'll remember it while you sign in.
              </p>
            </>
          ) : state === "success" ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 size={22} />
              </div>
              <p className="text-sm font-black text-rhozly-on-surface">
                You're in. Welcome to the garden.
              </p>
              {resolvedHomeId && (
                <p className="text-xs font-bold text-rhozly-on-surface/45">
                  Switch to this garden from the home picker if it isn't already active.
                </p>
              )}
              <button
                data-testid="join-home-go-dashboard"
                onClick={goToDashboard}
                className="inline-flex items-center gap-2 bg-rhozly-primary text-white px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black hover:opacity-90 transition shadow-sm"
              >
                Open the dashboard <ArrowRight size={14} />
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertCircle size={22} />
              </div>
              <p className="text-sm font-black text-rhozly-on-surface">
                {redeemError?.code === "invite_not_found" && "We can't find that invite."}
                {redeemError?.code === "invite_already_used" && "That invite has already been used."}
                {redeemError?.code === "invite_expired" && "That invite has expired."}
                {redeemError?.code === "email_mismatch" && "This invite is for a different email address."}
                {redeemError?.code === "no_email_on_account" && "Your account doesn't have an email address yet."}
                {redeemError?.code === "no_token" && "No invite token in this link."}
                {(!redeemError?.code || redeemError.code === "unknown") && "Something went wrong."}
              </p>
              {redeemError?.message && (
                <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug">
                  {redeemError.message}
                </p>
              )}
              {redeemError?.code === "email_mismatch" && redeemError.invitee && (
                <p className="text-xs font-bold text-rhozly-on-surface/55 leading-snug">
                  This invite was sent to{" "}
                  <span className="font-black text-rhozly-on-surface/75">{redeemError.invitee}</span>.
                  Sign in with that inbox and open the link again.
                </p>
              )}
              <button
                data-testid="join-home-go-dashboard"
                onClick={goToDashboard}
                className="inline-flex items-center gap-2 bg-rhozly-surface-low text-rhozly-on-surface px-5 py-3 min-h-[48px] rounded-2xl text-sm font-black hover:bg-rhozly-surface-low/70 transition"
              >
                Back to Rhozly
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
