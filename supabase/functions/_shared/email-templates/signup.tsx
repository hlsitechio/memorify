/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles as s, BRAND } from './_styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to activate your {siteName} workspace</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandBar}>
          <span style={s.brandDot} />
          <span style={s.brandWord}>{BRAND.name}</span>
        </Text>

        <Heading style={s.h1}>Confirm your email</Heading>
        <Text style={s.text}>
          Welcome to <Link href={siteUrl} style={s.link}><strong>{siteName}</strong></Link>. One last step —
          confirm <strong>{recipient}</strong> so we can activate your workspace.
        </Text>

        <Section style={s.buttonRow}>
          <Button href={confirmationUrl} style={s.buttonAccent}>Activate workspace</Button>
        </Section>

        <Text style={s.text}>
          Or paste this link into your browser:<br />
          <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
        </Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          You're receiving this because someone signed up for {siteName} with this address.
          If it wasn't you, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
