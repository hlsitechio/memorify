// Shared brand styles for Memorify auth emails.
// Brand: dark cyan/teal accent (hsl 174 85% 55% ≈ #29E3C7) on white email body.
// Email body MUST stay white per platform rules.

export const BRAND = {
  name: 'Memorify',
  accent: '#29E3C7',
  accentDark: '#0B0F17',
  ink: '#0A0F1A',
  text: '#3F4754',
  muted: '#8A93A1',
  hairline: '#E6EAF0',
  surface: '#F7F9FB',
  white: '#FFFFFF',
}

const fontSans =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const fontMono =
  'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Consolas, monospace'

export const styles = {
  main: { backgroundColor: BRAND.white, fontFamily: fontSans, margin: 0, padding: '32px 0' },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    padding: '0 28px',
  },
  brandBar: {
    display: 'block',
    fontFamily: fontMono,
    fontSize: '11px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: BRAND.muted,
    margin: '0 0 28px',
  },
  brandDot: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    background: BRAND.accent,
    marginRight: '10px',
    verticalAlign: 'middle' as const,
  },
  brandWord: { color: BRAND.ink, fontWeight: 600 as const, letterSpacing: '0.18em' },
  h1: {
    fontSize: '24px',
    fontWeight: 600 as const,
    color: BRAND.ink,
    letterSpacing: '-0.01em',
    margin: '0 0 18px',
    lineHeight: 1.25,
  },
  text: {
    fontSize: '15px',
    color: BRAND.text,
    lineHeight: '1.65',
    margin: '0 0 18px',
  },
  link: { color: BRAND.ink, textDecoration: 'underline' },
  button: {
    backgroundColor: BRAND.ink,
    color: BRAND.white,
    fontSize: '14px',
    fontWeight: 600 as const,
    borderRadius: '10px',
    padding: '13px 22px',
    textDecoration: 'none',
    display: 'inline-block',
    letterSpacing: '0.01em',
  },
  buttonAccent: {
    backgroundColor: BRAND.accent,
    color: BRAND.accentDark,
    fontSize: '14px',
    fontWeight: 600 as const,
    borderRadius: '10px',
    padding: '13px 22px',
    textDecoration: 'none',
    display: 'inline-block',
    letterSpacing: '0.01em',
    boxShadow: '0 6px 24px -8px rgba(41,227,199,0.55)',
  },
  buttonRow: { margin: '8px 0 28px' },
  card: {
    background: BRAND.surface,
    border: `1px solid ${BRAND.hairline}`,
    borderRadius: '12px',
    padding: '14px 18px',
    margin: '4px 0 24px',
  },
  codeBox: {
    fontFamily: fontMono,
    fontSize: '28px',
    fontWeight: 600 as const,
    color: BRAND.ink,
    letterSpacing: '0.4em',
    background: BRAND.surface,
    border: `1px solid ${BRAND.hairline}`,
    borderRadius: '12px',
    padding: '18px 20px',
    textAlign: 'center' as const,
    margin: '4px 0 24px',
  },
  hr: { borderColor: BRAND.hairline, margin: '28px 0 16px' },
  footer: {
    fontSize: '12px',
    color: BRAND.muted,
    lineHeight: '1.6',
    margin: '0',
  },
  footerMono: {
    fontFamily: fontMono,
    fontSize: '11px',
    color: BRAND.muted,
    letterSpacing: '0.08em',
    margin: '6px 0 0',
  },
}
