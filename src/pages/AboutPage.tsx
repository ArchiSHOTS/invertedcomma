import { Link } from "react-router-dom";
import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import SEO from "../components/SEO";

export default function AboutPage() {
  return (
    <>
      <SEO
        title="About Inverted Comma"
        description="Inverted Comma curates high-contrast quotes, counterpoints and conversations — from books, films, speeches, art and beyond. Learn about our mission."
        path="/about"
      />
      <div className="min-h-screen bg-[#FBF9F6] flex flex-col">
        <SiteHeader />
        <main className="flex-1 max-w-2xl mx-auto w-full px-4 md:px-6 py-14 md:py-20">

          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#3D5A3E] mb-4">About</p>
          <h1 className="font-serif italic font-bold text-4xl md:text-5xl text-stone-900 leading-tight mb-8">
            Quotes worth<br />thinking about.
          </h1>

          <div className="prose prose-stone max-w-none space-y-5 text-stone-700 text-[15px] leading-relaxed">
            <p>
              <strong>Inverted Comma</strong> is a quote platform built around the idea that a single sentence — stripped of context and platform — is rarely the whole story.
            </p>
            <p>
              We collect quotes from books, films, speeches, interviews, essays and poems, then add the layer that most platforms skip: <em>context</em>. Who said it, and why? What were the circumstances? What was the counter-argument? What has been misremembered, simplified or misattributed over time?
            </p>
            <p>
              Our goal is a library of high-contrast ideas — not a hall of inspirational posters, but a place where you can read something that genuinely challenges how you think.
            </p>

            <h2 className="font-serif italic font-bold text-2xl text-stone-900 pt-4">What we curate</h2>
            <p>
              Literature, cinema, philosophy, science, politics, art, sport and beyond. We are deliberately eclectic and deliberately global — you will find Kafka and Kurosawa alongside Frida Kahlo and P.G. Wodehouse, Satyajit Ray and Asghar Farhadi.
            </p>
            <p>
              We use AI to generate contextual background for authors and quotes — always clearly labelled — and treat these as starting points for human editorial review, not endpoints.
            </p>

            <h2 className="font-serif italic font-bold text-2xl text-stone-900 pt-4">The name</h2>
            <p>
              An inverted comma (the British English term for a quotation mark) is the device that says: <em>these are not my words, but they are worth repeating</em>. That tension — between the original speaker and the person doing the sharing — is exactly what this site is about.
            </p>

            <h2 className="font-serif italic font-bold text-2xl text-stone-900 pt-4">Contact</h2>
            <p>
              Questions, suggestions or contributions: <a href="mailto:hello@invertedcomma.com" className="text-[#3D5A3E] underline hover:opacity-70">hello@invertedcomma.com</a>
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-stone-200 flex gap-6 text-xs text-stone-400">
            <Link to="/terms"   className="hover:text-stone-700 transition-colors">Terms of use</Link>
            <Link to="/privacy" className="hover:text-stone-700 transition-colors">Privacy policy</Link>
            <Link to="/"        className="hover:text-stone-700 transition-colors">Back to explore</Link>
          </div>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
