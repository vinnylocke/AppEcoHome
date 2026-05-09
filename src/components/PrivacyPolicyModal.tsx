import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function PrivacyPolicyModal({ onClose }: Props) {
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-white animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-rhozly-outline/15 shrink-0">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Rhozly
          </p>
          <h2 className="text-base font-black text-rhozly-on-surface leading-tight">
            Privacy Policy
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-rhozly-surface-low transition-colors"
          aria-label="Close privacy policy"
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
            This Privacy Policy explains how Rhozly ("we", "us", or "the Company") collects, uses, and
            discloses information when you use the Rhozly app and related services. By using Rhozly
            you agree to the terms described here.
          </p>
        </Section>

        <Section title="Definitions">
          <dl className="space-y-2">
            <Definition term="Account">Your unique access point to the Service.</Definition>
            <Definition term="Company">Rhozly, based in the United Kingdom.</Definition>
            <Definition term="Personal Data">Information relating to an identified or identifiable individual.</Definition>
            <Definition term="Usage Data">Information collected automatically when you use the Service.</Definition>
            <Definition term="Service Provider">Third parties that process data on our behalf.</Definition>
          </dl>
        </Section>

        <Section title="Data We Collect">
          <p className="mb-3">We may collect the following personal data:</p>
          <ul className="space-y-1">
            <Li>Email address</Li>
            <Li>First and last name</Li>
            <Li>Home address and location information</Li>
          </ul>
          <p className="mt-3 mb-3">Usage data collected automatically includes:</p>
          <ul className="space-y-1">
            <Li>IP address and browser information</Li>
            <Li>Pages visited and time spent in the app</Li>
            <Li>Device identifiers and mobile device information</Li>
          </ul>
          <p className="mt-3 mb-3">With your permission, the app may also access:</p>
          <ul className="space-y-1">
            <Li>Location (for weather and garden planning features)</Li>
            <Li>Camera and photos (for plant identification and area scanning)</Li>
          </ul>
        </Section>

        <Section title="How We Use Your Data">
          <ul className="space-y-1">
            <Li>Providing and maintaining the Service</Li>
            <Li>Managing your account</Li>
            <Li>Communicating with you about your account or the Service</Li>
            <Li>Improving and developing new features</Li>
            <Li>Analytics to understand how the Service is used</Li>
            <Li>Complying with legal obligations</Li>
          </ul>
        </Section>

        <Section title="Data Sharing">
          <p className="mb-3">
            We do not sell your personal data. We may share it with:
          </p>
          <ul className="space-y-1">
            <Li>Service providers who help us operate the Service (e.g. hosting, analytics)</Li>
            <Li>Business partners with your explicit consent</Li>
            <Li>Other users only in explicitly public areas (e.g. published community guides)</Li>
            <Li>Relevant parties if Rhozly is involved in a merger or acquisition</Li>
            <Li>Law enforcement or regulators when legally required</Li>
          </ul>
        </Section>

        <Section title="Data Retention">
          <ul className="space-y-1">
            <Li>Account data: retained for the duration of your account plus 24 months after closure</Li>
            <Li>Support data: up to 24 months after a support ticket closes</Li>
            <Li>Usage data: up to 24 months for analytics and security purposes</Li>
          </ul>
          <p className="mt-3">
            Data may be retained longer where required by law or for legitimate business reasons.
          </p>
        </Section>

        <Section title="Data Transfer">
          <p>
            Your information may be processed in countries outside the United Kingdom. Where data is
            transferred internationally we apply appropriate safeguards in accordance with applicable
            data protection law.
          </p>
        </Section>

        <Section title="Your Rights">
          <p>
            You can view, correct, or request deletion of your personal data at any time from your
            account settings, or by contacting us directly. You also have the right to object to
            processing, request restriction, and data portability under applicable law.
          </p>
        </Section>

        <Section title="Children's Privacy">
          <p>
            Rhozly is not directed at children under 16. We do not knowingly collect personal data
            from anyone under 16. If you believe we have done so inadvertently, please contact us
            and we will delete it promptly.
          </p>
        </Section>

        <Section title="Third-Party Links">
          <p>
            The Service may contain links to external websites or services. We are not responsible
            for the privacy practices of those third parties and encourage you to review their
            policies.
          </p>
        </Section>

        <Section title="Changes to This Policy">
          <p>
            We may update this policy from time to time. When we do, the "Last updated" date above
            will change. For significant changes we will notify you by email or via a prominent
            notice in the app.
          </p>
        </Section>

        <Section title="Contact Us">
          <p>
            Questions or concerns about this policy? Please contact us at{" "}
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

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-rhozly-primary shrink-0 mt-0.5">•</span>
      <span>{children}</span>
    </li>
  );
}
