/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles as s, BRAND } from './_styles.ts'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {BRAND.name} verification code</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brandBar}>
          <span style={s.brandDot} />
          <span style={s.brandWord}>{BRAND.name}</span>
        </Text>

        <Heading style={s.h1}>Confirm it's you</Heading>
        <Text style={s.text}>
          Enter this code in {BRAND.name} to confirm your identity. It expires in a few minutes.
        </Text>

        <Text style={s.codeBox}>{token}</Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          If you didn't request this code, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
