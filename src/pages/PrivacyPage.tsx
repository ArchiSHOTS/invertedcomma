import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import SEO from "../components/SEO";

const UPDATED = "1 June 2025";

export default function PrivacyPage() {
  return (
    <>
      <SEO
        title="Privacy Policy"
        description="Privacy policy for Inverted Comma — how we collect, use and protect your data."
        path="/privacy"
      />
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-14">

          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mb-3">Legal</p>
          <h1 className="font-serif italic font-bold text-3xl md:text-4xl text-stone-900 mb-2">Privacy Policy</h1>
          <p className="text-xs text-stone-400 mb-10">Last updated: {UPDATED}</p>

          <div className="space-y-8 text-[15px] text-stone-700 leading-relaxed">
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">1. What we collect</h2>
              <p>When you create an account, we collect your email address, chosen display name, and password (hashed — we never store it in plain text). If you sign in with Google, we receive only the data Google provides (name, email, profile picture). We also store the quotes you bookmark and any comments or discussions you participate in.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">2. How we use your data</h2>
              <p>Your data is used to operate your account, personalise your experience (saved quotes, collections, interests), and — if you subscribe — to send the weekly newsletter. We do not sell your personal data to third parties.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">3. Cookies and local storage</h2>
              <p>We use browser local storage to remember your session, saved quotes, and UI preferences. We do not use third-party tracking cookies. If you share a quote card, no data is sent to social platforms unless you explicitly choose to post it.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">4. Analytics</h2>
              <p>We may use privacy-respecting analytics (no personally identifiable information is collected). Aggregate data such as page views and popular quotes helps us improve the site.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">5. Affiliate and advertising partners</h2>
              <p>Clicking an affiliate link may place a cookie from a third-party retailer. We have no control over those cookies. Sponsored content is always clearly labelled.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">6. Data retention and deletion</h2>
              <p>You can delete your account at any time by contacting us. When you do, your personal data (email, saved quotes, comments) is permanently deleted within 30 days.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">7. Your rights</h2>
              <p>Depending on your location, you may have the right to access, correct, or delete your data, or to object to certain processing. Contact us at <a href="mailto:privacy@invertedcomma.com" className="text-[#3D5A3E] underline">privacy@invertedcomma.com</a> to exercise these rights.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">8. Changes</h2>
              <p>We may update this policy. Significant changes will be announced via the newsletter or a notice on the site.</p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-stone-200 flex gap-6 text-xs text-stone-400">
            <Link to="/terms" className="hover:text-stone-700 transition-colors">Terms of use</Link>
            <Link to="/about" className="hover:text-stone-700 transition-colors">About</Link>
            <Link to="/"      className="hover:text-stone-700 transition-colors">Back to explore</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
