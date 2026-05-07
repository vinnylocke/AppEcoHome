import React, { useState } from "react";
import { X, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Props {
  defaultName: string | null;
  defaultEmail: string | null;
  onClose: () => void;
}

export default function ContactSupportModal({ defaultName, defaultEmail, onClose }: Props) {
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { error: fnError } = await supabase.functions.invoke("contact-support", {
        body: { name: name.trim(), email: email.trim(), message: message.trim() },
      });
      if (fnError) throw fnError;
      setSent(true);
    } catch (err: any) {
      setError("Something went wrong — please try again or email support@rhozly.com directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        data-testid="contact-support-modal"
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rhozly-outline/10">
          <div>
            <h2 className="text-base font-black text-rhozly-on-surface">Contact Support</h2>
            <p className="text-xs text-rhozly-on-surface/40 font-medium mt-0.5">
              We typically reply within one business day
            </p>
          </div>
          <button
            data-testid="contact-support-close"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {sent ? (
          /* Success state */
          <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-rhozly-primary/10 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-rhozly-primary" />
            </div>
            <h3 className="text-lg font-black text-rhozly-on-surface">Message sent!</h3>
            <p className="text-sm text-rhozly-on-surface/50 leading-relaxed">
              We've received your request and sent a confirmation to <strong>{email}</strong>. We'll be in touch soon.
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-rhozly-primary text-white text-sm font-bold hover:bg-rhozly-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  Your name
                </label>
                <input
                  data-testid="contact-support-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-3 py-2.5 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-low text-sm font-semibold text-rhozly-on-surface placeholder:text-rhozly-on-surface/25 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 transition-shadow"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                  Your email
                </label>
                <input
                  data-testid="contact-support-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-low text-sm font-semibold text-rhozly-on-surface placeholder:text-rhozly-on-surface/25 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 transition-shadow"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                Message
              </label>
              <textarea
                data-testid="contact-support-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe what you're experiencing or what you'd like help with…"
                className="w-full px-3 py-2.5 rounded-xl border border-rhozly-outline/20 bg-rhozly-surface-low text-sm font-semibold text-rhozly-on-surface placeholder:text-rhozly-on-surface/25 focus:outline-none focus:ring-2 focus:ring-rhozly-primary/30 transition-shadow resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              data-testid="contact-support-submit"
              type="submit"
              disabled={loading || !name.trim() || !email.trim() || !message.trim()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-rhozly-primary text-white text-sm font-bold hover:bg-rhozly-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              {loading ? "Sending…" : "Send Message"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
