/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles as s, BRAND } from './_styles.ts'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName, oldEmail, newEmail, confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email for {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandBar}>
          <span style={s.brandDot} />
          <span style={s.brandWord}>{BRAND.name}</span>
        </Text>

        <Heading style={s.h1}>Confirm your email change</Heading>
        <Text style={s.text}>
          You requested to change the email on your {siteName} account.
        </Text>

        <Section style={s.card}>
          <Text style={{ ...s.text, margin: '4px 0' }}>
            <strong style={{ color: BRAND.muted, fontWeight: 500 }}>From:</strong>{' '}
            <Link href={`mailto:${oldEmail}`} style={s.link}>{oldEmail}</Link>
          </Text>
          <Text style={{ ...s.text, margin: '4px 0' }}>
            <strong style={{ color: BRAND.muted, fontWeight: 500 }}>To:</strong>{' '}
            <Link href={`mailto:${newEmail}`} style={s.link}>{newEmail}</Link>
          </Text>
        </Section>

        <Section style={s.buttonRow}>
          <Button href={confirmationUrl} style={s.buttonAccent}>Confirm email change</Button>
        </Section>

        <Text style={s.text}>
          Or paste this link into your browser:<br />
          <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
        </Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          If you didn't request this change, secure your account immediately by resetting your password.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
