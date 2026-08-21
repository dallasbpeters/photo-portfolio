import "./LegalPage.css";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons-pro/core-stroke-standard";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Toaster } from "sonner";
import { SiteNav } from "../cms/SiteNav";
import { type PageSummary, pagesApi } from "../services/portfolioService";
import { useSiteSettings } from "../theme/SiteSettingsProvider";

interface LegalPageProps {
  kind: "privacy" | "terms";
}

interface LegalSection {
  body: string;
  heading: string;
}

const OWNER_NAME = "Dallas Peters";

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    body: "When you use this site, we collect the information you give us directly and information gathered automatically. If you create an account or sign in, we store the email address you authenticate with. If you upload photographs through the admin area, we store those images and the metadata (such as title, description and camera details) you provide with them. We also collect limited usage data, including pages visited and interactions, through an analytics service.",
    heading: "Information we collect",
  },
  {
    body: "If you choose to sign in with Google, we receive only the basic account details Google shares for authentication — your name and email address. If you import images from Google Drive, the import runs through the official Google Picker and the Drive APIs. The Drive scope we request is read-only, we do not store your Google password, and we download only the files you explicitly choose to import.",
    heading: "Google sign-in and Google Drive",
  },
  {
    body: "We use your information to operate the site: to authenticate you, to store and display the photographs you upload, to send you emails you have requested (such as password reset messages), and to understand how the site is used so we can improve it. We do not sell your personal information, and we do not use it for advertising.",
    heading: "How we use your information",
  },
  {
    body: "Your photographs are stored on secure cloud storage and served publicly when you publish them to the gallery. We share data with a small number of service providers who help us run the site — hosting, image and file storage, email delivery, and analytics. These providers process your data only to provide those services. We may also disclose information where required by law, or to protect the rights, property or safety of the site, its users or others.",
    heading: "How we share your information",
  },
  {
    body: "We use a small amount of local storage and cookies to keep you signed in and to remember your preferences. You can clear this data from your browser at any time; some parts of the site may ask you to sign in again afterwards.",
    heading: "Cookies and storage",
  },
  {
    body: "We keep your account and uploaded photographs for as long as your account is active. You can remove photographs at any time from the admin area. If you would like your account or associated data deleted, contact us using the details below and we will remove what we hold, subject to legal requirements to keep some records.",
    heading: "Data retention and deletion",
  },
  {
    body: "Depending on where you live, you may have rights over your personal information, including the right to access, correct, or delete it, and the right to object to or restrict certain processing. To exercise any of these rights, contact us using the details below.",
    heading: "Your choices and rights",
  },
  {
    body: "We may update this Privacy Policy from time to time. When we make material changes, we will update the date at the top of this page and, where appropriate, notify you.",
    heading: "Changes to this policy",
  },
  {
    body: `Questions about this Privacy Policy can be sent to ${OWNER_NAME} at the email address listed on this site's contact page.`,
    heading: "Contact",
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    body: "By accessing or using this site, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use the site.",
    heading: "Acceptance of terms",
  },
  {
    body: "This site is a photography portfolio. The admin area lets the owner and invited administrators upload, organise and publish photographs. Public visitors may view the photographs and pages published to the gallery.",
    heading: "The service",
  },
  {
    body: "Some features require an account. You are responsible for keeping your sign-in credentials secure and for any activity that happens under your account. You must be at least 13 years old to use the site.",
    heading: "Accounts",
  },
  {
    body: "You retain ownership of the photographs and content you upload. By uploading content to the admin area, you grant us the limited right to store, display and distribute it as needed to operate the site and to show it on the gallery you publish it to. You confirm that you have the right to upload and publish anything you add, and that it does not infringe the rights of others.",
    heading: "Your content",
  },
  {
    body: "You agree not to misuse the site — for example, by attempting to disrupt it, bypass its security or authentication, upload unlawful or harmful content, or use automated means to access it without permission.",
    heading: "Acceptable use",
  },
  {
    body: "The photographs, design and content on this site are protected by copyright and other intellectual property laws. Photographs remain the property of their creators. You may not reproduce or redistribute content from this site without permission, except as the site itself permits.",
    heading: "Intellectual property",
  },
  {
    body: `The site is provided "as is" and "as available", without warranties of any kind, whether express or implied. We do not warrant that the site will be uninterrupted, secure or free of errors.`,
    heading: "No warranty",
  },
  {
    body: "To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special or consequential damages arising from your use of, or inability to use, the site.",
    heading: "Limitation of liability",
  },
  {
    body: "We may revise these Terms of Service at any time. Continued use of the site after changes take effect means you accept the revised terms.",
    heading: "Changes to these terms",
  },
  {
    body: `Questions about these Terms of Service can be sent to ${OWNER_NAME} at the email address listed on this site's contact page.`,
    heading: "Contact",
  },
];

/**
 * Public privacy policy and terms of service pages.
 *
 * Required by Google's OAuth verification process (and standard practice) as
 * links on the consent screen. Served on every site from the shared app shell,
 * no sign-in required.
 */
export function LegalPage({ kind }: LegalPageProps) {
  const { settings } = useSiteSettings();
  const [pages, setPages] = useState<PageSummary[]>([]);

  useEffect(() => {
    void pagesApi
      .list()
      .then((list) => setPages(list))
      .catch(() => undefined);
  }, []);

  const title = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
  const updated = kind === "privacy" ? "Last updated: August 14, 2026" : "";
  const sections = kind === "privacy" ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <div className="page legal-page">
      <Toaster position="top-center" theme="dark" />

      <header className="page__body legal-page__masthead">
        <Link className="legal-page__wordmark" to="/">
          {settings.heroTitle}
        </Link>
        <SiteNav pages={pages} />
      </header>

      <main className="page__body page__body--reading legal-page__main">
        <nav aria-label="Breadcrumb" className="legal-page__crumbs">
          <ol className="row label label--quiet row--wrap">
            <li>
              <Link className="quiet-link" to="/">
                {settings.shortName}
              </Link>
            </li>
            <li aria-hidden className="row">
              <HugeiconsIcon icon={ArrowRight01Icon} size={11} />
            </li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>

        <h1 className="legal-page__title">{title}</h1>
        {updated ? (
          <p className="label label--quiet legal-page__updated">{updated}</p>
        ) : null}

        <div className="stack stack--loose">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="legal-page__heading">{section.heading}</h2>
              <p className="legal-page__prose">{section.body}</p>
            </section>
          ))}
        </div>
      </main>

      <footer className="page__body hairline label label--quiet legal-page__footer">
        <nav className="row row--between row--wrap">
          <span>{settings.shortName}</span>
          <span className="row">
            <Link className="quiet-link" to="/privacy">
              Privacy
            </Link>
            <Link className="quiet-link" to="/terms">
              Terms
            </Link>
          </span>
        </nav>
      </footer>
    </div>
  );
}
