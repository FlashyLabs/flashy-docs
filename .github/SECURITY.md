# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Flashy, please email **security@flashylabs.com** instead of using the public issue tracker.

Include:
- Description of the vulnerability
- Steps to reproduce (if possible)
- Affected component(s) and version(s)
- Impact assessment
- Proposed fix (if you have one)

We will acknowledge your report within 48 hours and work toward a fix. Please allow 90 days for us to release a patch before public disclosure, unless the vulnerability is already public.

## Security Best Practices

When using Flashy:

- **Never commit secrets** (API keys, credentials) to any repository. Use environment variables or a secrets manager.
- **Verify token signatures** before accepting credentials. All Flashy tokens are signed and must be verified.
- **Validate all user input** at system boundaries (API routes, webhooks, CLI arguments).
- **Use HTTPS everywhere.** TLS is required for all communication with Flashy services.
- **Revoke credentials immediately** if compromised. Revocation is immediate and irreversible.
- **Audit all transfers.** Keep logs of all settlement activity for regulatory compliance.
- **Test error cases.** The examples include error-handling tests; verify your implementation handles them.

## Consent and Authority Model

Flashy enforces **explicit consent** and **attenuation-only delegation**:

- A value movement requires the holder's explicit consent token. There is no auto-approval pathway.
- A grant can only narrow authority (spend $100 → $50), never widen it (spend $50 → $100).
- Revocation is immediate; all pending operations under a revoked grant fail.
- Credentials expire; expired credentials refuse all operations.

These constraints are tested in the suite. Do not add pathways that bypass them.

## Threat Model

Flashy assumes:

- **Network is untrusted.** All communication is authenticated and encrypted (HTTPS, signed tokens).
- **Attackers may replay messages.** Idempotency keys prevent double-spend on retries.
- **Attackers may eavesdrop.** Sensitive data (balances, identities) are never logged in cleartext.
- **Attackers may forge tokens.** All tokens are signed; verification is mandatory.
- **Insiders may misbehave.** Consent requirements and audit logs provide accountability.

Flashy does **not** assume:

- Client-side applications are secure. Always verify token signatures server-side.
- The network is fast. Consent tokens have time windows; clock drift is handled gracefully.
- All parties are honest. Consent collection and sealing prove agreement explicitly.

## Cryptography

- **Hashing:** SHA-256 (portable across platforms, NIST standard)
- **Signatures:** RSA 2048 or ECDSA P-256 (verifiable without calling Flashy)
- **Key rotation:** Public keys are published in JWKS at `/.well-known/jwks.json`

Never rely on custom or non-standard crypto. All cryptographic operations use established, peer-reviewed algorithms.

## Incident Response

If a vulnerability is discovered and exploited:

1. **Patch immediately.** All critical security patches are released within 24 hours.
2. **Notify affected parties.** Security advisories are published to the GitHub Security Advisory database.
3. **Revoke compromised credentials.** If credentials are leaked, revocation is immediate.
4. **Audit the logs.** Examine settlement and credential logs for unauthorized activity.
5. **Communication.** Updates posted to security@flashylabs.com and GitHub Security Advisories.

## Vulnerability Disclosure

We follow responsible disclosure:

- Report vulnerabilities privately to **security@flashylabs.com**
- We acknowledge receipt within 48 hours
- We provide a 90-day window to patch before public disclosure
- Public disclosure includes a CVE identifier and detailed mitigation steps

## Third-Party Dependencies

All dependencies are pinned to specific versions. Dependencies are:
- Checked for known vulnerabilities (GitHub Dependabot)
- Reviewed for license compliance
- Updated on a regular schedule or on-demand for security patches

Monitor your own `package.json` for updates and security advisories.

## Contact

- **Security issues:** security@flashylabs.com
- **General questions:** security@flashylabs.com
- **Bug reports:** GitHub Issues (for non-security bugs)
- **Discussions:** GitHub Discussions

---

Thank you for helping keep Flashy secure.
