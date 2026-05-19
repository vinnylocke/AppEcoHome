import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  onClose: () => void;
}

export default function CookiePolicyModal({ onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  return createPortal(
    <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Cookie Policy" className="fixed inset-0 z-[200] flex flex-col bg-rhozly-bg animate-in fade-in duration-200">
      {/* Header — matches app header */}
      <div className="flex items-center justify-between px-5 py-4 shrink-0 bg-gradient-to-r from-rhozly-primary to-rhozly-primary-container shadow-md">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
            Rhozly
          </p>
          <h2 className="text-base font-black text-white leading-tight">
            Cookie Policy
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/20 transition-colors"
          aria-label="Close cookie policy"
        >
          <X size={18} className="text-white/70" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
        <p className="text-[11px] font-bold text-rhozly-on-surface/40 mb-6 uppercase tracking-widest">
          Last updated: 9 May 2026
        </p>

        <Section title="Overview">
          <p>
            This Cookie Policy explains what cookies are, how Rhozly uses them, and the choices
            you have regarding their use. Cookies do not typically contain information that
            personally identifies you, but personal data that we store about you may be linked to
            cookie information. Sensitive information such as passwords is never stored in cookies.
          </p>
        </Section>

        <Section title="Definitions">
          <div className="bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/15 divide-y divide-rhozly-outline/10">
            <Definition term="Company">Rhozly ("we", "us", or "our").</Definition>
            <Definition term="Cookies">
              Small files placed on your computer, mobile device, or other device by a website,
              containing details of your browsing history.
            </Definition>
            <Definition term="Website">
              The Rhozly app and associated web presence at rhozly.com.
            </Definition>
            <Definition term="You">
              The individual accessing or using the Service.
            </Definition>
          </div>
        </Section>

        <Section title="Types of Cookies We Use">
          <div className="space-y-3">
            <CookieType
              name="Necessary / Essential Cookies"
              type="Session"
              administered="Rhozly"
            >
              These cookies are essential to provide you with services available through the app
              and to enable core features such as authentication and navigation. Without these
              cookies the app cannot function correctly and they cannot be disabled.
            </CookieType>

            <CookieType
              name="Functionality Cookies"
              type="Persistent"
              administered="Rhozly"
            >
              These cookies remember choices you make — such as your login details, language
              preferences, and display settings — so you get a more personalised experience on
              future visits. Disabling them may mean some preferences are not saved between
              sessions.
            </CookieType>
          </div>
        </Section>

        <Section title="Your Cookie Choices">
          <p className="mb-3">
            You can instruct your browser to refuse all cookies or to indicate when a cookie is
            being sent. If you do not accept cookies, some parts of the app may not function as
            intended.
          </p>
          <p className="mb-3">Browser-specific guidance:</p>
          <div className="bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/15 divide-y divide-rhozly-outline/10">
            <BrowserRow browser="Chrome">
              Settings → Privacy and security → Cookies and other site data
            </BrowserRow>
            <BrowserRow browser="Microsoft Edge">
              Settings → Cookies and site permissions → Manage and delete cookies
            </BrowserRow>
            <BrowserRow browser="Firefox">
              Settings → Privacy &amp; Security → Cookies and Site Data
            </BrowserRow>
            <BrowserRow browser="Safari">
              Preferences → Privacy → Manage Website Data
            </BrowserRow>
          </div>
          <p className="mt-3">
            Please note that disabling necessary cookies will prevent you from signing in or using
            the app.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this Cookie Policy from time to time. The "Last updated" date at the top
            of this page will reflect any changes. We encourage you to review this policy
            periodically.
          </p>
        </Section>

        <Section title="Contact Us">
          <div className="bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/15 p-4">
            <p>
              If you have questions about our use of cookies, please contact us at{" "}
              <a
                href="mailto:privacy@rhozly.com"
                className="text-rhozly-primary font-bold underline underline-offset-2"
              >
                privacy@rhozly.com
              </a>
              .
            </p>
          </div>
        </Section>

        <div className="h-8" />
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-4 rounded-full bg-rhozly-primary shrink-0" />
        <h3 className="text-sm font-black text-rhozly-on-surface uppercase tracking-widest">{title}</h3>
      </div>
      <div className="text-[13px] font-medium text-rhozly-on-surface/70 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <dt className="font-black text-rhozly-on-surface shrink-0 text-[13px]">{term}:</dt>
      <dd className="text-[13px] font-medium text-rhozly-on-surface/60">{children}</dd>
    </div>
  );
}

function CookieType({
  name,
  type,
  administered,
  children,
}: {
  name: string;
  type: string;
  administered: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-rhozly-surface-lowest rounded-2xl border border-rhozly-outline/15 p-4">
      <p className="font-black text-rhozly-on-surface text-[13px] mb-2">{name}</p>
      <div className="flex gap-2 mb-3">
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rhozly-primary/8 text-rhozly-primary border border-rhozly-primary/15">
          {type}
        </span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-rhozly-primary/8 text-rhozly-primary border border-rhozly-primary/15">
          {administered}
        </span>
      </div>
      <p className="text-[12px] font-medium text-rhozly-on-surface/60 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function BrowserRow({ browser, children }: { browser: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="font-black text-rhozly-on-surface shrink-0 text-[13px]">{browser}:</span>
      <span className="text-[13px] font-medium text-rhozly-on-surface/60">{children}</span>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="w-1.5 h-1.5 rounded-full bg-rhozly-primary shrink-0 mt-1.5" />
      <span>{children}</span>
    </li>
  );
}
