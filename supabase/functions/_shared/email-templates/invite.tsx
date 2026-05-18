/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles as s, BRAND } from './_styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandBar}>
          <span style={s.brandDot} />
          <span style={s.brandWord}>{BRAND.name}</span>
        </Text>

        <Heading style={s.h1}>You've been invited</Heading>
        <Text style={s.text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={s.link}><strong>{siteName}</strong></Link>{' '}
          — a workspace for your AI memory, documents and agents.
        </Text>

        <Section style={s.buttonRow}>
          <Button href={confirmationUrl} style={s.buttonAccent}>Accept invitation</Button>
        </Section>

        <Text style={s.text}>
          Or paste this link into your browser:<br />
          <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
        </Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          If you weren't expecting this invitation, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
