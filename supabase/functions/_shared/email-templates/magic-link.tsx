/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles as s, BRAND } from './_styles.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your secure sign-in link for {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandBar}>
          <span style={s.brandDot} />
          <span style={s.brandWord}>{BRAND.name}</span>
        </Text>

        <Heading style={s.h1}>Your sign-in link</Heading>
        <Text style={s.text}>
          Click the button below to sign in to {siteName}. This link will expire shortly
          and can only be used once.
        </Text>

        <Section style={s.buttonRow}>
          <Button href={confirmationUrl} style={s.buttonAccent}>Sign in to {siteName}</Button>
        </Section>

        <Text style={s.text}>
          Or paste this link into your browser:<br />
          <Link href={confirmationUrl} style={s.link}>{confirmationUrl}</Link>
        </Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          If you didn't request this link, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
