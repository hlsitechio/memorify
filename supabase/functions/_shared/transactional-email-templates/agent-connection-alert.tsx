/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Memorify'

interface Props {
  agentName?: string
  agentKind?: string
  workspaceName?: string
  workspaceHandle?: string
  workspaceCode?: string
  connectedAt?: string
  ipAddress?: string
  userAgent?: string
  manageUrl?: string
  loginUrl?: string
  revokeUrl?: string
  accountEmail?: string
}

const AgentConnectionAlert = ({
  agentName = 'An AI agent',
  agentKind,
  workspaceName,
  workspaceHandle,
  workspaceCode,
  connectedAt,
  ipAddress,
  userAgent,
  manageUrl = 'https://memorify.dev/dashboard/agents',
  loginUrl = 'https://memorify.dev/dashboard/agents',
  revokeUrl,
  accountEmail,
}: Props) => {
  const friendlyUrl = workspaceHandle ? `memorify.dev/ws/${workspaceHandle}` : null
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{agentName} just connected to your {SITE_NAME} workspace</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New agent connection</Heading>
        <Text style={text}>
          <strong>{agentName}</strong>{agentKind ? ` (${agentKind})` : ''} just connected
          {workspaceName ? <> to workspace <strong>{workspaceName}</strong></> : ''} on your {SITE_NAME} account.
        </Text>

        <Section style={card}>
          <Row label="Agent" value={agentName} />
          {agentKind && <Row label="Kind" value={agentKind} />}
          {workspaceName && <Row label="Workspace" value={workspaceName} />}
          {friendlyUrl && <Row label="URL" value={friendlyUrl} />}
          {workspaceCode && <Row label="Workspace ID" value={workspaceCode} />}
          {connectedAt && <Row label="When" value={connectedAt} />}
          {ipAddress && <Row label="IP address" value={ipAddress} />}
          {userAgent && <Row label="Client" value={userAgent} />}
        </Section>

        <Text style={text}>
          We recommend signing in to your {SITE_NAME} account
          {friendlyUrl ? <> at <strong>{friendlyUrl}</strong></> : ''}
          {accountEmail ? <> (<strong>{accountEmail}</strong>)</> : ''} to
          review this connection. If you can't sign in right now, you can
          cancel this agent's connection immediately using the second button below.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0 12px' }}>
          <Button href={loginUrl} style={primaryButton}>Sign in to review</Button>
        </Section>

        {revokeUrl && (
          <Section style={{ textAlign: 'center', margin: '0 0 24px' }}>
            <Button href={revokeUrl} style={dangerButton}>Cancel this agent connection</Button>
            <Text style={fineprint}>
              This link revokes only this agent's access token. Your account stays safe.
            </Text>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          You're receiving this security alert because an AI agent connected to your {SITE_NAME} workspace
          {workspaceCode ? <> (<span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{workspaceCode}</span>)</> : ''}.
        </Text>
      </Container>
    </Body>
  </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <Text style={rowStyle}>
    <span style={rowLabel}>{label}</span>
    <span style={rowValue}>{value}</span>
  </Text>
)

export const template = {
  component: AgentConnectionAlert,
  subject: (d: Record<string, any>) =>
    `Security alert: ${d?.agentName ?? 'An agent'} connected to your ${SITE_NAME} workspace`,
  displayName: 'Agent connection alert',
  previewData: {
    agentName: 'Sample Agent',
    agentKind: 'claude_code',
    workspaceName: 'agent:sample-agent',
    workspaceHandle: 'your-handle',
    workspaceCode: 'ws_xxxxxxxxxxxx',
    connectedAt: 'May 18, 2026 at 14:32 UTC',
    ipAddress: '203.0.113.42',
    userAgent: 'claude-code/1.4 (macOS)',
    manageUrl: 'https://memorify.dev/dashboard/agents',
    loginUrl: 'https://memorify.dev/ws/your-handle',
    revokeUrl: 'https://example.com/revoke-preview',
    accountEmail: 'you@example.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 600, color: '#0a0a0a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#3f3f46', lineHeight: '1.6', margin: '0 0 16px' }
const card = { background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: '10px', padding: '16px 18px', margin: '20px 0' }
const rowStyle = { fontSize: '13px', color: '#27272a', margin: '4px 0', display: 'block' }
const rowLabel = { display: 'inline-block', width: '110px', color: '#71717a' }
const rowValue: React.CSSProperties = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#0a0a0a' }
const primaryButton = { backgroundColor: '#0a0a0a', color: '#ffffff', padding: '11px 22px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none', display: 'inline-block' }
const dangerButton = { backgroundColor: '#dc2626', color: '#ffffff', padding: '11px 22px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, textDecoration: 'none', display: 'inline-block' }
const fineprint = { fontSize: '12px', color: '#71717a', margin: '10px 0 0' }
const hr = { borderColor: '#e4e4e7', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#a1a1aa', margin: 0 }
