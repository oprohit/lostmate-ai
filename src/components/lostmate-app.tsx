"use client";

import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Compass,
  FileText,
  Hand,
  ImagePlus,
  Inbox,
  LayoutDashboard,
  ListFilter,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  MessageCircle,
  PackageCheck,
  PanelLeft,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isNativePlatform, pickNativeImage, registerNativeBackButton } from "@/lib/native";

type Role = "user" | "staff" | "admin";
type View = "home" | "assistant" | "found" | "reports" | "matches" | "claims" | "dashboard";

type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarColor: string;
};

type Extraction = {
  itemType: string;
  category: string;
  brand: string;
  color: string;
  description: string;
  location: string;
  occurredAt: string;
  distinguishingFeatures: string;
  provider?: "gemini" | "fallback";
  confidence?: number;
};

type Report = {
  id: string;
  reporterId: string;
  reporterName?: string;
  reporterEmail?: string;
  type: "lost" | "found";
  status: "open" | "matched" | "claimed" | "closed";
  itemType: string;
  category: string;
  brand: string | null;
  color: string | null;
  description: string;
  distinguishingFeatures: string | null;
  location: string;
  occurredAt: string | null;
  holdingLocation: string | null;
  imageUrl: string | null;
  aiExtracted: boolean;
  createdAt: string;
};

type Match = {
  id: string;
  confidence: number;
  explanation: string;
  status: "suggested" | "accepted" | "rejected";
  lostReport?: Report;
  foundReport?: Report;
};

type Claim = {
  id: string;
  status: "pending" | "approved" | "completed" | "rejected";
  reportId: string;
  itemType: string;
  reportType: "lost" | "found";
  reportLocation: string;
  claimantName: string;
  claimantEmail: string;
  handoverLocation: string | null;
  notes: string | null;
  createdAt: string;
};

type Stats = { lost: number; found: number; possibleMatches: number; claimed: number };
type Message = { id: string; role: "assistant" | "user"; text: string; time: string };

type ApiError = { error?: string };

async function api<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const configuredBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const endpoint = typeof input === "string" && input.startsWith("/") ? `${configuredBase}${input}` : input;
  const response = await fetch(endpoint, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date not specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function formatRelative(value: string) {
  const date = new Date(value);
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "Yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function titleFor(view: View, user: User | null) {
  if (view === "assistant") return "Report with AI";
  if (view === "found") return "Report found item";
  if (view === "reports") return user?.role === "staff" || user?.role === "admin" ? "Report queue" : "My reports";
  if (view === "matches") return "Possible matches";
  if (view === "claims") return "Claims & handovers";
  if (view === "dashboard") return "Staff overview";
  return "Home";
}

function DemoChat() {
  return (
    <div className="demo-window">
      <div className="demo-window__top">
        <span className="ai-orb ai-orb--small"><Sparkles size={14} /></span>
        <div><strong>LostMate AI</strong><span>Item intelligence</span></div>
        <span className="live-pill"><i /> Live demo</span>
      </div>
      <div className="demo-window__body">
        <div className="chat-bubble chat-bubble--user">I lost my black AirPods near the library.</div>
        <div className="chat-bubble chat-bubble--ai"><span className="mini-label">LostMate AI</span><br />I can help with that. Do you remember approximately when you lost them?</div>
        <div className="chat-bubble chat-bubble--user">Today around 2 PM.</div>
        <div className="demo-summary"><div className="demo-summary__head"><span><CheckCircle2 size={14} /> Ready to report</span><span>92% confident</span></div><strong>Black AirPods</strong><span>Electronics · Library · Today, 2 PM</span></div>
      </div>
      <div className="demo-window__input">Describe a lost or found item <Send size={16} /></div>
    </div>
  );
}

function AuthModal({ mode, onClose, onSuccess }: { mode: "login" | "signup"; onClose: () => void; onSuccess: (user: User) => void }) {
  const [authMode, setAuthMode] = useState(mode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api<{ user: User }>(`/api/auth/${authMode === "login" ? "login" : "signup"}`, { method: "POST", body: JSON.stringify({ name, email, password }) });
      onSuccess(data.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(role: "staff" | "user") {
    setEmail(role === "staff" ? "staff@lostmate.demo" : "demo@lostmate.demo");
    setPassword(role === "staff" ? "demo-staff-2026" : "demo-user-2026");
    setAuthMode("login");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        <div className="auth-modal__brand"><span className="logo-mark"><Sparkles size={17} /></span><span>LostMate <em>AI</em></span></div>
        <div className="eyebrow">{authMode === "login" ? "Welcome back" : "Start finding"}</div>
        <h2 id="auth-title">{authMode === "login" ? "Sign in to LostMate" : "Create your account"}</h2>
        <p className="muted">{authMode === "login" ? "Your reports and match alerts, all in one place." : "Report naturally. We’ll take care of the details."}</p>
        {error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}
        <form onSubmit={submit} className="stack-form">
          {authMode === "signup" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" /></label>}
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@campus.edu" type="email" autoComplete="email" required /></label>
          <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" type="password" minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"} required /></label>
          <button className="button button--primary button--wide" disabled={busy}>{busy ? <Loader2 className="spin" size={17} /> : authMode === "login" ? <LogIn size={17} /> : <Sparkles size={17} />} {busy ? "Working…" : authMode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <div className="auth-switch">{authMode === "login" ? "New to LostMate?" : "Already have an account?"} <button onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setError(""); }}>{authMode === "login" ? "Create an account" : "Sign in"}</button></div>
        <div className="demo-access"><span>Quick demo access</span><div><button onClick={() => fillDemo("user")}>Demo user</button><button onClick={() => fillDemo("staff")}>Staff view</button></div></div>
      </section>
    </div>
  );
}

function Landing({ onAuth, onReport }: { onAuth: (mode: "login" | "signup") => void; onReport: (type: "lost" | "found") => void }) {
  return (
    <div className="landing-page">
      <header className="public-header page-container">
        <button className="brand-lockup" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><span className="logo-mark"><Sparkles size={16} /></span><span>LOSTMATE <em>AI</em></span></button>
        <nav className="public-nav"><a href="#how-it-works">How it works</a><a href="#trust">Built for real life</a></nav>
        <div className="public-actions"><button className="button button--ghost" onClick={() => onAuth("login")}>Sign in</button><button className="button button--primary button--small" onClick={() => onAuth("signup")}>Get started <ArrowUpRight size={15} /></button></div>
      </header>
      <main>
        <section className="hero page-container">
          <div className="hero__copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Campus item intelligence</div>
            <h1>Lost something?<br /><span>Let AI help find it.</span></h1>
            <p className="hero__lead">Describe it naturally, upload a photo, and LostMate connects the details that matter — so lost items get home faster.</p>
            <div className="hero__actions"><button className="button button--primary button--large" onClick={() => onReport("lost")}>Report lost item <ArrowRight size={17} /></button><button className="button button--secondary button--large" onClick={() => onReport("found")}>I found something <PackageCheck size={17} /></button></div>
            <div className="hero-trust"><div className="avatar-stack"><span>JR</span><span>AK</span><span>ML</span><span>+</span></div><span><strong>2,400+</strong> items reunited across campus</span></div>
          </div>
          <div className="hero__visual"><div className="visual-glow" /><DemoChat /><div className="floating-note floating-note--top"><span className="signal-icon"><Sparkles size={14} /></span><div><strong>AI understood</strong><span>black · AirPods · library</span></div></div><div className="floating-note floating-note--bottom"><span className="match-icon"><Check size={15} /></span><div><strong>87% possible match</strong><span>Found near Library</span></div></div></div>
        </section>
        <section className="logo-strip page-container"><span>MADE FOR THE PLACES PEOPLE GATHER</span><div><strong>Campus</strong><strong>Offices</strong><strong>Events</strong><strong>Public spaces</strong></div></section>
        <section id="how-it-works" className="steps-section page-container"><div className="section-heading"><div><div className="eyebrow">Simple by design</div><h2>From “where is it?”<br /><span>to “there it is.”</span></h2></div><p>Every report gets a little more useful with AI — not more complicated for the person submitting it.</p></div><div className="steps-grid"><Step number="01" icon={<MessageCircle size={21} />} title="Tell us what happened" copy="Use your own words. Our assistant understands lost, found, and everything in between." /><Step number="02" icon={<ImagePlus size={21} />} title="Add the details" copy="Upload a photo or answer one quick follow-up. We extract the details that make an item findable." /><Step number="03" icon={<BadgeCheck size={21} />} title="Verify the match" copy="See transparent confidence and reasoning. Staff and owners always make the final call." /></div></section>
        <section id="trust" className="trust-section page-container"><div className="trust-card"><div className="trust-card__copy"><div className="eyebrow">Designed for trust</div><h2>AI suggests.<br /><span>People verify.</span></h2><p>LostMate never auto-claims an item. Every possible match shows its reasoning, from color and category to location and time.</p><button className="text-button" onClick={() => onAuth("signup")}>Explore LostMate <ArrowRight size={16} /></button></div><div className="trust-list"><TrustItem icon={<ShieldCheck size={19} />} title="Private by default" copy="Only the details needed to reunite an item are shared." /><TrustItem icon={<SlidersHorizontal size={19} />} title="Human in the loop" copy="Staff review every handoff before an item is marked returned." /><TrustItem icon={<Building2 size={19} />} title="Fits your place" copy="Set up for colleges, offices, events, and public institutions." /></div></div></section>
        <section className="final-cta page-container"><div><div className="eyebrow">Ready when you are</div><h2>Make the next lost item<br /><span>the last one.</span></h2></div><button className="button button--primary button--large" onClick={() => onReport("lost")}>Report an item <ArrowRight size={17} /></button></section>
      </main>
      <footer className="public-footer page-container"><div className="brand-lockup"><span className="logo-mark"><Sparkles size={14} /></span><span>LOSTMATE <em>AI</em></span></div><span>© 2026 LostMate AI · Built for better reunions.</span><span>Secure · Thoughtful · Human-led</span></footer>
    </div>
  );
}

function Step({ number, icon, title, copy }: { number: string; icon: React.ReactNode; title: string; copy: string }) {
  return <article className="step-card"><div className="step-card__top"><span className="step-number">{number}</span><span className="step-icon">{icon}</span></div><h3>{title}</h3><p>{copy}</p></article>;
}

function TrustItem({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <div className="trust-item"><span className="trust-item__icon">{icon}</span><div><strong>{title}</strong><p>{copy}</p></div></div>;
}

function AppShell({ user, view, setView, onLogout, children }: { user: User; view: View; setView: (view: View) => void; onLogout: () => void; children: React.ReactNode }) {
  const staff = user.role === "staff" || user.role === "admin";
  const nav = staff
    ? [{ id: "dashboard" as View, label: "Overview", icon: LayoutDashboard }, { id: "reports" as View, label: "Reports", icon: ClipboardList }, { id: "matches" as View, label: "Matches", icon: Sparkles }, { id: "claims" as View, label: "Claims", icon: Hand }]
    : [{ id: "assistant" as View, label: "Report with AI", icon: MessageCircle }, { id: "found" as View, label: "Found item", icon: PackageCheck }, { id: "reports" as View, label: "My reports", icon: ClipboardList }, { id: "matches" as View, label: "Matches", icon: Sparkles }];
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button className="brand-lockup brand-lockup--sidebar" onClick={() => setView("home")}><span className="logo-mark"><Sparkles size={16} /></span><span>LOSTMATE <em>AI</em></span></button>
        <div className="workspace-label">{staff ? "STAFF WORKSPACE" : "YOUR SPACE"}</div>
        <nav className="side-nav">{nav.map((item) => { const Icon = item.icon; return <button key={item.id} className={`side-nav__item ${view === item.id ? "is-active" : ""}`} onClick={() => setView(item.id)}><Icon size={18} /><span>{item.label}</span>{view === item.id && <ChevronRight size={15} />}</button>; })}</nav>
        <div className="sidebar-help"><span className="help-icon"><ShieldCheck size={17} /></span><strong>{staff ? "Verification desk" : "Need a hand?"}</strong><p>{staff ? "Every handoff is a moment of trust." : "Our AI assistant is ready whenever you are."}</p><button onClick={() => setView(staff ? "claims" : "assistant")}>{staff ? "Open claims" : "Ask LostMate"} <ArrowUpRight size={14} /></button></div>
        <div className="sidebar-user"><span className="avatar" style={{ background: user.avatarColor }}>{initials(user.name)}</span><div><strong>{user.name}</strong><span>{staff ? "Staff member" : user.email}</span></div><button className="icon-button" aria-label="Log out" onClick={onLogout}><LogOut size={16} /></button></div>
      </aside>
      <div className="app-content">
        <header className="app-header"><div className="app-header__left"><button className="mobile-menu icon-button" aria-label="Open navigation"><Menu size={20} /></button><div><div className="mobile-brand"><span className="logo-mark"><Sparkles size={14} /></span>LOSTMATE <em>AI</em></div><div className="app-header__title">{titleFor(view, user)}</div></div></div><div className="app-header__right"><span className="status-dot" /> <span className="desktop-only">All systems operational</span><span className="avatar avatar--header" style={{ background: user.avatarColor }}>{initials(user.name)}</span></div></header>
        <main className="app-main">{children}</main>
        <nav className="mobile-bottom-nav">{nav.slice(0, 4).map((item) => { const Icon = item.icon; return <button key={item.id} className={view === item.id ? "is-active" : ""} onClick={() => setView(item.id)}><Icon size={20} /><span>{item.label.replace("Report with AI", "Report")}</span></button>; })}</nav>
      </div>
    </div>
  );
}

function WelcomeHome({ user, onNavigate }: { user: User; onNavigate: (view: View) => void }) {
  const staff = user.role === "staff" || user.role === "admin";
  return <div className="workspace-home"><div className="welcome-row"><div><div className="eyebrow">{staff ? "Operations at a glance" : "Your LostMate space"}</div><h1>{staff ? "Good morning, " : "Welcome back, "}<span>{user.name.split(" ")[0]}.</span></h1><p>{staff ? "Here’s what needs a thoughtful review today." : "Let’s bring something home."}</p></div><span className="date-chip"><Clock3 size={15} /> {new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}</span></div>{staff ? <Dashboard onNavigate={onNavigate} compact /> : <div className="home-grid"><button className="start-card start-card--primary" onClick={() => onNavigate("assistant")}><span className="start-card__icon"><Sparkles size={22} /></span><div><span className="eyebrow">Fastest way to report</span><h2>Tell LostMate<br />what happened.</h2><p>Use your own words. AI will organize the rest.</p></div><span className="start-card__arrow"><ArrowUpRight size={20} /></span></button><button className="start-card start-card--light" onClick={() => onNavigate("found")}><span className="start-card__icon"><PackageCheck size={21} /></span><div><span className="eyebrow">Help it get home</span><h2>Found an item?</h2><p>Add the details so its owner can find it.</p></div><span className="start-card__arrow"><ArrowUpRight size={20} /></span></button><div className="home-mini-card"><div className="mini-card-heading"><span>How it works</span><span className="step-pips"><i className="active" /><i /><i /></span></div><div className="mini-flow"><span><MessageCircle size={17} /></span><ChevronRight size={14} /><span><Sparkles size={17} /></span><ChevronRight size={14} /><span><BadgeCheck size={17} /></span></div><p>Describe · Understand · Reunite</p></div><div className="home-mini-card home-mini-card--dark"><div className="mini-card-heading"><span>Privacy first</span><ShieldCheck size={17} /></div><strong>Your information stays purposeful.</strong><p>Only share what helps identify your item.</p></div></div>}</div>;
}

function AssistantPage({ user, onCreated }: { user: User; onCreated: (matches: Match[]) => void }) {
  const [reportType, setReportType] = useState<"lost" | "found">("lost");
  const [messages, setMessages] = useState<Message[]>([{ id: "welcome", role: "assistant", text: "Tell me what you lost or found, and where. I’ll turn it into a clear report for you.", time: "Now" }]);
  const [input, setInput] = useState("");
  const [lastMessage, setLastMessage] = useState("");
  const [draftContext, setDraftContext] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [nativeImageData, setNativeImageData] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<Report | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function sendMessage(event?: React.FormEvent) {
    event?.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    setError(""); setInput(""); setBusy(true);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: "user", text: message, time: "Now" }]);
    try {
      const result = await api<{ reply: string; extraction?: Extraction; missing: string[]; requiresConfirmation: boolean; intent: string }>("/api/assistant", { method: "POST", body: JSON.stringify({ message, type: reportType, context: draftContext }) });
      setMessages((current) => [...current, { id: `assistant-${Date.now()}`, role: "assistant", text: result.reply, time: "Now" }]);
      if (result.extraction) { setExtraction(result.extraction); setDraftContext(draftContext ? `${draftContext}. ${message}` : message); }
      setLastMessage(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI is temporarily unavailable.");
    } finally { setBusy(false); }
  }

  async function addImage() {
    if (isNativePlatform()) {
      try {
        const dataUrl = await pickNativeImage();
        if (dataUrl) { setNativeImageData(dataUrl); setImage(null); setPreview(dataUrl); setError(""); }
      } catch { setError("Camera or gallery access was cancelled. You can continue without a photo."); }
      return;
    }
    fileInput.current?.click();
  }

  function chooseImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG, or WebP image smaller than 5 MB."); return; }
    setImage(file); setNativeImageData(""); setPreview(URL.createObjectURL(file)); setError("");
  }

  async function submitReport() {
    if (!extraction || submitBusy) return;
    setSubmitBusy(true); setError("");
    try {
      let imageUrl = "";
      if (image || nativeImageData) {
        const dataUrl = image ? await readFile(image) : nativeImageData;
        const upload = await api<{ url: string | null }>("/api/uploads", { method: "POST", body: JSON.stringify({ dataUrl }) });
        imageUrl = upload.url ?? "";
      }
      const result = await api<{ report: Report; matches: Array<Match & { candidate: Report }> }>("/api/reports", { method: "POST", body: JSON.stringify({ confirmed: true, type: reportType, ...extraction, sourceText: draftContext || lastMessage, imageUrl, aiExtracted: extraction.provider === "gemini", aiMetadata: { provider: extraction.provider, confidence: extraction.confidence } }) });
      setSuccess(result.report); onCreated(result.matches.map((match) => ({ ...match, ...(reportType === "lost" ? { lostReport: result.report, foundReport: match.candidate } : { foundReport: result.report, lostReport: match.candidate }) })));
      setMessages((current) => [...current, { id: `success-${Date.now()}`, role: "assistant", text: "Your report is live. I’ll surface possible matches below as soon as they appear.", time: "Now" }]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn’t submit that report."); } finally { setSubmitBusy(false); }
  }

  if (success) return <div className="success-page"><div className="success-icon"><CheckCircle2 size={32} /></div><div className="eyebrow">Report created</div><h1>It’s in the system.</h1><p>LostMate will keep looking for a thoughtful match. You can see the report and any suggestions in your workspace.</p><div className="success-report"><span className="report-type-pill report-type-pill--lost">{success.type === "lost" ? "Lost report" : "Found report"}</span><strong>{success.color ? `${success.color} ` : ""}{success.itemType}</strong><span><MapPin size={14} /> {success.location}</span></div><button className="button button--primary" onClick={() => { setSuccess(null); setExtraction(null); setDraftContext(""); setLastMessage(""); setMessages([{ id: "welcome-new", role: "assistant", text: "Tell me what you lost or found, and where.", time: "Now" }]); }}>Report another item <Plus size={17} /></button></div>;

  return <div className="assistant-layout"><section className="assistant-panel"><div className="assistant-panel__intro"><div className="eyebrow">Your AI guide</div><h1>Let’s find it<br /><span>together.</span></h1><p>Start with what you remember. You don’t need the perfect words.</p></div><div className="report-toggle"><button className={reportType === "lost" ? "is-active" : ""} onClick={() => setReportType("lost")}><Search size={15} /> I lost something</button><button className={reportType === "found" ? "is-active" : ""} onClick={() => setReportType("found")}><PackageCheck size={15} /> I found something</button></div><div className="chat-thread">{messages.map((message) => <div key={message.id} className={`thread-message thread-message--${message.role}`}><div className="thread-avatar">{message.role === "assistant" ? <Sparkles size={14} /> : initials(user.name)}</div><div><div className="thread-name">{message.role === "assistant" ? "LostMate AI" : "You"}<span>{message.time}</span></div><div className="thread-bubble">{message.text}</div></div></div>)}{busy && <div className="thread-message thread-message--assistant"><div className="thread-avatar"><Sparkles size={14} /></div><div className="thread-bubble typing"><i /><i /><i /></div></div>}</div><form className="chat-composer" onSubmit={sendMessage}><button type="button" className="composer-add" aria-label="Add an image" onClick={addImage}><Camera size={19} /></button><input value={input} onChange={(event) => setInput(event.target.value)} placeholder={reportType === "lost" ? "I lost my…" : "I found a…"} disabled={busy} /><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={chooseImage} /><button className="composer-send" aria-label="Send message" disabled={!input.trim() || busy}><Send size={17} /></button></form>{preview && <div className="image-attachment"><img src={preview} alt="Selected item" /><span>{image?.name ?? "Camera photo"}</span><button className="icon-button" onClick={() => { setImage(null); setNativeImageData(""); setPreview(""); }} aria-label="Remove image"><X size={14} /></button></div>}{error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}<p className="composer-note"><ShieldCheck size={13} /> AI suggestions are reviewed before anything is claimed.</p></section><aside className="assistant-side"><div className="side-card side-card--tip"><span className="side-card__icon"><Sparkles size={17} /></span><div className="eyebrow">Helpful hint</div><h3>Specific beats perfect.</h3><p>Color, brand, nearby landmark, or a small scratch can make a big difference.</p></div>{extraction && <ConfirmationCard extraction={extraction} onSubmit={submitReport} busy={submitBusy} />}</aside></div>;
}

async function readFile(file: File) {
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
}

function ConfirmationCard({ extraction, onSubmit, busy }: { extraction: Extraction; onSubmit: () => void; busy: boolean }) {
  const fields = [["Item", extraction.itemType], ["Category", extraction.category], ["Color", extraction.color], ["Place", extraction.location], ["When", extraction.occurredAt]];
  return <div className="confirmation-card"><div className="confirmation-card__head"><span className="ai-orb ai-orb--small"><Sparkles size={13} /></span><div><strong>Here’s what I understood</strong><span>{extraction.provider === "gemini" ? "Gemini verified" : "AI fallback · review details"}</span></div></div><div className="confirmation-fields">{fields.filter(([, value]) => value).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="confirmation-description">{extraction.description}</div><button className="button button--primary button--wide" onClick={onSubmit} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} {busy ? "Submitting…" : "Confirm & submit report"}</button><span className="confirmation-footnote">You can review your report after submitting.</span></div>;
}

function FoundForm({ onCreated }: { onCreated: (matches: Match[]) => void }) {
  const [form, setForm] = useState({ itemType: "", category: "", brand: "", color: "", description: "", location: "", occurredAt: "", holdingLocation: "" });
  const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [done, setDone] = useState(false);
  function update(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit() {
    setBusy(true); setError("");
    try { const result = await api<{ report: Report; matches: Array<Match & { candidate: Report }> }>("/api/reports", { method: "POST", body: JSON.stringify({ confirmed: true, type: "found", ...form, aiExtracted: false }) }); setDone(true); onCreated(result.matches as Match[]); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save report."); } finally { setBusy(false); }
  }
  if (done) return <div className="form-success"><div className="success-icon success-icon--small"><Check size={24} /></div><h2>Thank you for turning it in.</h2><p>Your found-item report is ready for its owner to discover.</p><button className="button button--secondary" onClick={() => { setDone(false); setConfirm(false); setForm({ itemType: "", category: "", brand: "", color: "", description: "", location: "", occurredAt: "", holdingLocation: "" }); }}>Report another found item</button></div>;
  return <div className="form-layout"><div className="form-intro"><div className="eyebrow">A good deed, made findable</div><h1>Give it a way<br /><span>back home.</span></h1><p>Share enough context for the owner to recognize their item. You can keep sensitive details private.</p><div className="found-callout"><ShieldCheck size={18} /><span><strong>Safety note</strong> Don’t include passwords, access codes, or private documents in the description.</span></div></div><section className="report-form-card"><div className="form-card-heading"><div><h2>Found item details</h2><p>Fields with an asterisk help us match faster.</p></div><span className="form-step">1 <span>/</span> 1</span></div><div className="form-grid"><label className="field-span-2">What did you find? *<input value={form.itemType} onChange={(e) => update("itemType", e.target.value)} placeholder="e.g. Black AirPods Pro" /></label><label>Category *<select value={form.category} onChange={(e) => update("category", e.target.value)}><option value="">Choose one</option><option>Electronics</option><option>Personal items</option><option>Bags</option><option>Documents</option><option>Clothing</option><option>Accessories</option><option>Other</option></select></label><label>Color<input value={form.color} onChange={(e) => update("color", e.target.value)} placeholder="e.g. Black" /></label><label>Brand<input value={form.brand} onChange={(e) => update("brand", e.target.value)} placeholder="If visible" /></label><label>Found when<input type="datetime-local" value={form.occurredAt} onChange={(e) => update("occurredAt", e.target.value)} /></label><label className="field-span-2">Where did you find it? *<div className="input-with-icon"><MapPin size={16} /><input value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Library, 2nd floor" /></div></label><label className="field-span-2">Where are you holding it?<input value={form.holdingLocation} onChange={(e) => update("holdingLocation", e.target.value)} placeholder="e.g. Student services front desk" /></label><label className="field-span-2">Anything distinctive? *<textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="A case, sticker, scratch, or any detail an owner could recognize…" rows={4} /></label></div>{error && <div className="inline-error"><CircleAlert size={16} />{error}</div>}{!confirm ? <button className="button button--primary button--wide" onClick={() => { if (!form.itemType || !form.category || !form.location || !form.description) { setError("Add the item, category, location, and a distinguishing detail first."); return; } setError(""); setConfirm(true); }}>Review report <ArrowRight size={17} /></button> : <div className="review-box"><div><span className="eyebrow">Ready to submit?</span><strong>{form.color ? `${form.color} ` : ""}{form.itemType}</strong><span>{form.location} · {form.holdingLocation || "Holding location not listed"}</span></div><div className="review-actions"><button className="button button--ghost" onClick={() => setConfirm(false)}>Edit</button><button className="button button--primary" onClick={submit} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />} Confirm</button></div></div>}</section></div>;
}

function ReportsPage({ user }: { user: User }) {
  const [reports, setReports] = useState<Report[]>([]); const [filter, setFilter] = useState<"all" | "lost" | "found">("all"); const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { api<{ reports: Report[] }>(`/api/reports?${filter !== "all" ? `type=${filter}&` : ""}q=${encodeURIComponent(query)}`).then((data) => setReports(data.reports)).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load reports.")).finally(() => setLoading(false)); }, [filter, query]);
  const staff = user.role === "staff" || user.role === "admin";
  return <section className="list-page"><div className="list-page__heading"><div><div className="eyebrow">{staff ? "Live intake" : "Your activity"}</div><h1>{staff ? "Report queue" : "Your reports"}</h1><p>{staff ? "Review what’s coming in across your community." : "Keep track of every item you’ve put into motion."}</p></div>{!staff && <span className="list-count">{reports.length} total</span>}</div><div className="filter-bar"><div className="search-field"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item type…" /></div><div className="filter-pills"><button className={filter === "all" ? "is-active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "lost" ? "is-active" : ""} onClick={() => setFilter("lost")}>Lost</button><button className={filter === "found" ? "is-active" : ""} onClick={() => setFilter("found")}>Found</button></div><button className="filter-button"><SlidersHorizontal size={16} /> <span className="desktop-only">Filters</span></button></div>{loading ? <LoadingState label="Loading reports" /> : error ? <ErrorState message={error} /> : reports.length ? <div className="report-list"><div className="report-table"><div className="report-table__head"><span>Item</span><span>Location</span><span>Reported</span><span>Status</span><span /></div>{reports.map((report) => <ReportRow key={report.id} report={report} staff={staff} />)}</div><div className="mobile-report-cards">{reports.map((report) => <ReportCard key={report.id} report={report} staff={staff} />)}</div></div> : <EmptyState icon={<Inbox size={23} />} title={query ? "No reports found" : "No reports yet"} copy={query ? "Try a different item name or clear your search." : "When an item enters your story, it will show up here."} />}</section>;
}

function ReportRow({ report, staff }: { report: Report; staff: boolean }) {
  return <div className="report-table__row"><div className="report-item-cell"><span className={`item-thumb item-thumb--${report.type}`}><PackageCheck size={17} /></span><div><strong>{report.color ? `${report.color} ` : ""}{report.itemType}</strong><span>{report.category}{staff && report.reporterName ? ` · ${report.reporterName}` : ""}</span></div></div><span className="location-cell"><MapPin size={14} /> {report.location}</span><span className="date-cell">{formatRelative(report.createdAt)}</span><StatusPill status={report.status} /><button className="row-more" aria-label="Open report"><ArrowUpRight size={16} /></button></div>;
}

function ReportCard({ report, staff }: { report: Report; staff: boolean }) {
  return <article className="mobile-report-card"><div className="mobile-report-card__top"><span className={`item-thumb item-thumb--${report.type}`}><PackageCheck size={17} /></span><div><span className={`report-type-pill report-type-pill--${report.type}`}>{report.type}</span><strong>{report.color ? `${report.color} ` : ""}{report.itemType}</strong><span>{report.category}{staff && report.reporterName ? ` · ${report.reporterName}` : ""}</span></div><ArrowUpRight size={16} /></div><div className="mobile-report-card__meta"><span><MapPin size={14} />{report.location}</span><span><Clock3 size={14} />{formatRelative(report.createdAt)}</span><StatusPill status={report.status} /></div><p>{report.description}</p></article>;
}

function StatusPill({ status }: { status: string }) { return <span className={`status-pill status-pill--${status}`}>{status === "open" ? "Active" : status === "suggested" ? "Suggested" : status}</span>; }

function MatchesPage({ user }: { user: User }) {
  const [matches, setMatches] = useState<Match[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [action, setAction] = useState("");
  async function load() { setLoading(true); try { const data = await api<{ matches: Match[] }>("/api/matches"); setMatches(data.matches); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load matches."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function review(match: Match, status: "accepted" | "rejected") { setAction(match.id); try { await api(`/api/matches/${match.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to review match."); } finally { setAction(""); } }
  async function claim(match: Match) { const report = match.foundReport; if (!report) return; setAction(match.id); try { await api("/api/claims", { method: "POST", body: JSON.stringify({ reportId: report.id, matchId: match.id, notes: "Claim requested from a possible match." }) }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to submit claim."); } finally { setAction(""); } }
  const staff = user.role === "staff" || user.role === "admin";
  return <section className="list-page"><div className="list-page__heading"><div><div className="eyebrow">AI-assisted, human-verified</div><h1>Possible matches</h1><p>Signals, not certainty. Take a closer look before you make a connection.</p></div><span className="confidence-legend"><span /> confidence score</span></div>{loading ? <LoadingState label="Looking for connections" /> : error ? <ErrorState message={error} /> : matches.length ? <div className="match-list">{matches.map((match) => <MatchCard key={match.id} match={match} staff={staff} action={action} onReview={review} onClaim={claim} />)}</div> : <EmptyState icon={<Sparkles size={23} />} title="No possible matches yet" copy="New reports are compared automatically. We’ll let you know when the details line up." />}</section>;
}

function MatchCard({ match, staff, action, onReview, onClaim }: { match: Match; staff: boolean; action: string; onReview: (match: Match, status: "accepted" | "rejected") => void; onClaim: (match: Match) => void }) {
  const lost = match.lostReport; const found = match.foundReport;
  return <article className="match-card"><div className="match-card__top"><div className="match-score"><span>{Math.round(match.confidence * 100)}%</span><small>possible match</small></div><StatusPill status={match.status} /></div><div className="match-pair"><div className="match-item"><span className="match-item__label">LOST</span><strong>{lost?.color ? `${lost.color} ` : ""}{lost?.itemType ?? "Unknown item"}</strong><span><MapPin size={13} />{lost?.location ?? "Location unavailable"}</span></div><div className="match-connector"><span><Sparkles size={14} /></span><i /></div><div className="match-item match-item--found"><span className="match-item__label">FOUND</span><strong>{found?.color ? `${found.color} ` : ""}{found?.itemType ?? "Unknown item"}</strong><span><MapPin size={13} />{found?.location ?? "Location unavailable"}</span></div></div><div className="match-reason"><Sparkles size={15} /><div><strong>Why this surfaced</strong><p>{match.explanation}</p></div></div>{staff && match.status === "suggested" ? <div className="match-actions"><button className="button button--ghost" onClick={() => onReview(match, "rejected")} disabled={action === match.id}>Not a match</button><button className="button button--primary" onClick={() => onReview(match, "accepted")} disabled={action === match.id}>{action === match.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Review as match</button></div> : !staff && match.status !== "rejected" && found ? <button className="button button--secondary button--wide" onClick={() => onClaim(match)} disabled={action === match.id}>{action === match.id ? <Loader2 className="spin" size={15} /> : <Hand size={15} />} Request to claim found item</button> : null}</article>;
}

function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [action, setAction] = useState("");
  async function load() { setLoading(true); try { const data = await api<{ claims: Claim[] }>("/api/claims"); setClaims(data.claims); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load claims."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function updateClaim(claim: Claim, status: "approved" | "completed" | "rejected") { setAction(claim.id); try { await api(`/api/claims/${claim.id}`, { method: "PATCH", body: JSON.stringify({ status, handoverLocation: status === "completed" ? "Student services desk" : "" }) }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update claim."); } finally { setAction(""); } }
  return <section className="list-page"><div className="list-page__heading"><div><div className="eyebrow">Closing the loop</div><h1>Claims & handovers</h1><p>Make the final step clear, careful, and human.</p></div><span className="list-count">{claims.length} open records</span></div>{loading ? <LoadingState label="Loading claims" /> : error ? <ErrorState message={error} /> : claims.length ? <div className="claims-list">{claims.map((claim) => <article className="claim-card" key={claim.id}><div className="claim-card__main"><span className="claim-icon"><Hand size={18} /></span><div><div className="claim-card__title"><strong>{claim.itemType}</strong><StatusPill status={claim.status} /></div><p>{claim.claimantName} · {claim.claimantEmail}</p><span><MapPin size={14} /> {claim.reportLocation} · {formatRelative(claim.createdAt)}</span></div></div><div className="claim-card__actions">{claim.status === "pending" && <><button className="button button--ghost" onClick={() => updateClaim(claim, "rejected")} disabled={action === claim.id}>Reject</button><button className="button button--secondary" onClick={() => updateClaim(claim, "approved")} disabled={action === claim.id}>Approve</button></>}{claim.status === "approved" && <button className="button button--primary" onClick={() => updateClaim(claim, "completed")} disabled={action === claim.id}>{action === claim.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Mark handed over</button>}</div></article>)}</div> : <EmptyState icon={<Hand size={23} />} title="No claims waiting" copy="Approved or pending handovers will appear here." />}</section>;
}

function Dashboard({ onNavigate, compact = false }: { onNavigate: (view: View) => void; compact?: boolean }) {
  const [stats, setStats] = useState<Stats>({ lost: 0, found: 0, possibleMatches: 0, claimed: 0 }); const [activity, setActivity] = useState<Array<{ id: string; action: string; createdAt: string }>>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { api<{ stats: Stats; activity: typeof activity }>("/api/dashboard").then((data) => { setStats(data.stats); setActivity(data.activity); }).catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load overview.")).finally(() => setLoading(false)); }, []);
  if (loading) return <LoadingState label="Loading overview" />;
  if (error) return <ErrorState message={error} />;
  return <div className={`dashboard-content ${compact ? "dashboard-content--compact" : ""}`}>{!compact && <div className="list-page__heading"><div><div className="eyebrow">Operations at a glance</div><h1>Staff overview</h1><p>Keep good intentions moving toward a handoff.</p></div><button className="button button--secondary" onClick={() => onNavigate("reports")}><ClipboardList size={16} /> Review reports</button></div>}<div className="stat-grid"><Stat icon={<Search size={18} />} label="Active lost" value={stats.lost} tone="purple" /><Stat icon={<PackageCheck size={18} />} label="Active found" value={stats.found} tone="mint" /><Stat icon={<Sparkles size={18} />} label="Possible matches" value={stats.possibleMatches} tone="gold" /><Stat icon={<CheckCircle2 size={18} />} label="Items returned" value={stats.claimed} tone="blue" /></div><div className="dashboard-grid"><section className="dashboard-panel"><div className="panel-heading"><div><span className="eyebrow">Needs attention</span><h2>Today’s queue</h2></div><button className="text-button" onClick={() => onNavigate("matches")}>See all <ArrowRight size={15} /></button></div><div className="queue-list"><QueueItem icon={<Sparkles size={17} />} title={`${stats.possibleMatches} suggested matches`} copy="Review the reasoning before owners get notified." onClick={() => onNavigate("matches")} /><QueueItem icon={<Hand size={17} />} title="Claims & handovers" copy="Keep the final exchange clear and documented." onClick={() => onNavigate("claims")} /><QueueItem icon={<Inbox size={17} />} title={`${stats.lost + stats.found} active reports`} copy="Search the intake queue for fresh context." onClick={() => onNavigate("reports")} /></div></section><section className="dashboard-panel activity-panel"><div className="panel-heading"><div><span className="eyebrow">Audit trail</span><h2>Recent activity</h2></div><ClipboardCheck size={18} /></div>{activity.length ? <div className="activity-list">{activity.map((item) => <div className="activity-item" key={item.id}><span className="activity-dot" /><div><strong>{item.action.replaceAll("_", " ")}</strong><span>{formatRelative(item.createdAt)}</span></div></div>)}</div> : <div className="panel-empty"><ClipboardCheck size={22} /><p>Staff actions will appear here.</p></div>}</section></div></div>;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) { return <div className={`stat-card stat-card--${tone}`}><span className="stat-icon">{icon}</span><span>{label}</span><strong>{value}</strong><small>vs. last 30 days <ArrowUpRight size={12} /></small></div>; }
function QueueItem({ icon, title, copy, onClick }: { icon: React.ReactNode; title: string; copy: string; onClick: () => void }) { return <button className="queue-item" onClick={onClick}><span className="queue-icon">{icon}</span><span><strong>{title}</strong><small>{copy}</small></span><ChevronRight size={17} /></button>; }
function LoadingState({ label }: { label: string }) { return <div className="state-panel"><Loader2 className="spin" size={25} /><strong>{label}</strong><span>Just a moment.</span></div>; }
function ErrorState({ message }: { message: string }) { return <div className="state-panel state-panel--error"><CircleAlert size={25} /><strong>Something needs a second look</strong><span>{message}</span></div>; }
function EmptyState({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) { return <div className="state-panel state-panel--empty"><span className="empty-icon">{icon}</span><strong>{title}</strong><span>{copy}</span></div>; }

export default function LostMateApp() {
  const [user, setUser] = useState<User | null>(null); const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null); const [view, setView] = useState<View>("home"); const [authLoading, setAuthLoading] = useState(true); const [, setToast] = useState("");
  useEffect(() => { api<{ user: User | null }>("/api/auth/me").then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setAuthLoading(false)); }, []);
  useEffect(() => {
    let cleanup: () => void = () => undefined;
    registerNativeBackButton(() => { if (authMode) setAuthMode(null); else if (view !== "home") setView("home"); }).then((remove) => { cleanup = () => { void remove(); }; });
    return () => cleanup();
  }, [authMode, view]);
  function report(type: "lost" | "found") { if (!user) { setAuthMode("login"); return; } setView(type === "lost" ? "assistant" : "found"); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setView("home"); setToast("Signed out"); }
  if (authLoading) return <div className="loading-screen"><span className="logo-mark"><Sparkles size={19} /></span><Loader2 className="spin" size={20} /></div>;
  if (!user) return <><Landing onAuth={setAuthMode} onReport={report} />{authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} onSuccess={(nextUser) => { setUser(nextUser); setAuthMode(null); setView("home"); }} />}</>;
  let content: React.ReactNode;
  if (view === "home") content = <WelcomeHome user={user} onNavigate={setView} />;
  if (view === "assistant") content = <AssistantPage user={user} onCreated={() => setView("matches")} />;
  if (view === "found") content = <FoundForm onCreated={() => setView("matches")} />;
  if (view === "reports") content = <ReportsPage user={user} />;
  if (view === "matches") content = <MatchesPage user={user} />;
  if (view === "claims") content = <ClaimsPage />;
  if (view === "dashboard") content = <Dashboard onNavigate={setView} />;
  return <AppShell user={user} view={view} setView={setView} onLogout={logout}>{content}</AppShell>;
}
