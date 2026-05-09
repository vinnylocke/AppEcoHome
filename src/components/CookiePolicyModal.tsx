import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function CookiePolicyModal({ onClose }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/15 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Rhozly
          </p>
          <h2 className="text-base font-black text-rhozly-on-surface leading-tight">
            Cookie Policy
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-rhozly-surface-low transition-colors"
          aria-label="Close cookie policy"
        >
          <X size={18} className="text-rhozly-on-surface/50" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
        <p className="text-[11px] font-bold text-rhozly-on-surface/40 mb-6">
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
          <dl className="space-y-2">
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
          </dl>
        </Section>

        <Section title="Types of Cookies We Use">
          <div className="space-y-4">
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
          <ul className="space-y-1">
            <Li>
              <strong>Chrome:</strong> Settings → Privacy and security → Cookies and other site data
            </Li>
            <Li>
              <strong>Microsoft Edge:</strong> Settings → Cookies and site permissions → Manage and delete cookies
            </Li>
            <Li>
              <strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data
            </Li>
            <Li>
              <strong>Safari:</strong> Preferences → Privacy → Manage Website Data
            </Li>
          </ul>
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
      <h3 className="text-sm font-black text-rhozly-on-surface mb-2">{title}</h3>
      <div className="text-[13px] font-medium text-rhozly-on-surface/70 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="font-black text-rhozly-on-surface shrink-0">{term}:</dt>
      <dd>{children}</dd>
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
    <div className="p-3 rounded-xl bg-rhozly-surface-low border border-rhozly-outline/10">
      <p className="font-black text-rhozly-on-surface text-[13px] mb-1">{name}</p>
      <div className="flex gap-3 mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          Type: {type}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
          By: {administered}
        </span>
      </div>
      <p className="text-[12px] font-medium text-rhozly-on-surface/60 leading-relaxed">
        {children}
      </p>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-rhozly-primary shrink-0 mt-0.5">•</span>
      <span>{children}</span>
    </li>
  );
}
