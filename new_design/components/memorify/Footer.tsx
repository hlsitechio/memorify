import { Cpu, Github, Twitter, MessageSquare, Mail, FileText, Shield, Scale, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  const navSections = [
    {
      title: "Product",
      links: [
        { href: "#hero", label: "Overview" },
        { href: "#problem", label: "The Problem" },
        { href: "#architecture", label: "Architecture" },
        { href: "#protocol", label: "Protocol" },
        { href: "#primitives", label: "Primitives" },
        { href: "#demo", label: "Live Demo" },
        { href: "#comparison", label: "Comparison" },
        { href: "/auth", label: "Get Access" },
      ],
    },
    {
      title: "Developers",
      links: [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/docs", label: "Documentation" },
        { href: "/mcp", label: "MCP Server" },
        { href: "/api", label: "API Reference" },
        { href: "/agents", label: "Agent Management" },
        { href: "/connectors", label: "Connectors" },
        { href: "/skills", label: "Skills" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "#social-proof", label: "Customers" },
        { href: "/blog", label: "Blog" },
        { href: "/careers", label: "Careers" },
        { href: "/about", label: "About" },
        { href: "/contact", label: "Contact" },
        { href: "/security", label: "Security" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/privacy", label: "Privacy Policy" },
        { href: "/terms", label: "Terms of Service" },
        { href: "/cookie-policy", label: "Cookie Policy" },
        { href: "/security", label: "Security Policy" },
        { href: "/dpa", label: "Data Processing Addendum" },
      ],
    },
  ];

  const socialLinks = [
      { icon: Github, href: "https://github.com/hlsitechio/memorify", label: "GitHub" },
      { icon: Twitter, href: "https://twitter.com/memorify", label: "Twitter" },
      { icon: MessageSquare, href: "https://discord.gg/memorify", label: "Discord" },
      { icon: Mail, href: "mailto:hello@memorify.dev", label: "Email" },
    ];

  return (
    <footer className="border-t border-border/50 bg-background/50 backdrop-blur">
      <div className="container py-16 lg:py-24">
        {/* Main navigation grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-md bg-gradient-primary grid place-items-center">
                <Cpu className="w-4.5 h-4.5 text-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-semibold tracking-tight text-lg">Memorify</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              One gateway. Every agent. Every tool. The backend your agents actually share.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg border border-border bg-card/40 backdrop-blur grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
                  aria-label={social.label}
                >
                  <social.icon className="w-4.5 h-4.5" />
                </a>
              ))}
            </div>
          </div>

          {/* Nav sections */}
          {navSections.map((section) => (
            <div key={section.title}>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
                {section.title}
              </h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 group"
                    >
                      {link.label}
                      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[10px]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-border/50 mb-8" />

        {/* Bottom row: version, compliance, copyright */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Version & build info */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-muted-foreground">
            <span>v0.1.0-alpha</span>
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              Private Alpha
            </span>
            <span>Built on Netlify Edge + Neon + Clerk</span>
          </div>

          {/* Compliance badges */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Shield className="w-3.5 h-3.5 text-primary" />
              SOC 2 Type II
            </span>
            <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <Scale className="w-3.5 h-3.5 text-primary" />
              GDPR Compliant
            </span>
            <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Open Protocol
            </span>
          </div>

          {/* Copyright */}
          <p className="text-xs font-mono text-muted-foreground">
            © {currentYear} Memorify — Built in the open.
          </p>
        </div>
      </div>
    </footer>
  );
};
