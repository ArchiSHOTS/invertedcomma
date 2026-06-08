import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import SEO from "../components/SEO";

const UPDATED = "1 June 2025";

export default function TermsPage() {
  return (
    <>
      <SEO
        title="Terms of Use"
        description="Terms of use for Inverted Comma — read before using the site."
        path="/terms"
      />
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-14">

          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mb-3">Legal</p>
          <h1 className="font-serif italic font-bold text-3xl md:text-4xl text-stone-900 mb-2">Terms of Use</h1>
          <p className="text-xs text-stone-400 mb-10">Last updated: {UPDATED}</p>

          <div className="space-y-8 text-[15px] text-stone-700 leading-relaxed">
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">1. Acceptance</h2>
              <p>By accessing or using Inverted Comma ("the site"), you agree to these terms. If you do not agree, please do not use the site.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">2. Content and quotations</h2>
              <p>Quotations reproduced on this site are the intellectual property of their respective authors or rights holders. They are reproduced here for the purpose of commentary, criticism and education under applicable fair use and fair dealing provisions. If you believe a quotation has been reproduced in error, please contact us.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">3. User accounts</h2>
              <p>You are responsible for keeping your account credentials secure. You may not use the site for any unlawful purpose or to post content that is abusive, defamatory, or infringes the rights of others. We reserve the right to suspend or terminate accounts that violate these terms.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">4. AI-generated content</h2>
              <p>Some author biographies and contextual notes on this site are generated using AI. These are clearly labelled. We do not guarantee their accuracy and encourage users to verify information independently.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">5. Affiliate links and advertising</h2>
              <p>Some links on this site are affiliate links. We may earn a commission at no extra cost to you. Sponsored content and advertising are clearly labelled.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">6. Limitation of liability</h2>
              <p>The site is provided "as is." We make no warranties as to the accuracy, completeness or fitness for any particular purpose of the content. To the maximum extent permitted by law, we exclude all liability for loss or damage arising from use of the site.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">7. Changes</h2>
              <p>We may update these terms from time to time. Continued use of the site after changes constitutes acceptance of the new terms.</p>
            </section>
            <section>
              <h2 className="font-semibold text-stone-900 mb-2">8. Contact</h2>
              <p>Questions: <a href="mailto:legal@invertedcomma.com" className="text-[#3D5A3E] underline">legal@invertedcomma.com</a></p>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-stone-200 flex gap-6 text-xs text-stone-400">
            <Link to="/privacy" className="hover:text-stone-700 transition-colors">Privacy policy</Link>
            <Link to="/about"   className="hover:text-stone-700 transition-colors">About</Link>
            <Link to="/"        className="hover:text-stone-700 transition-colors">Back to explore</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
