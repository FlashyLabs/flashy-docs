# FlashyID OAuth: Authentication and Delegation

Learn FlashyID, Flashy's OAuth 2.1 provider and delegation layer. Issue credentials, enforce attenuation on delegation, and verify credential chains.

## What Problem Does It Solve?

You need:
- **Authentication:** Verify who a user is
- **Authorization:** Control what they can do (delegated authority)
- **Attenuation:** Delegation that narrows authority, never widens it
- **Revocation:** Revoke credentials immediately
- **Portability:** Verify credentials on any platform

FlashyID solves this with OAuth 2.1 and a delegation layer where delegation is always attenuation.

## Key Concepts

### OAuth Flow
Standard OAuth 2.1 / OpenID Connect authorization flow.

```
1. User: "Log me in"
2. App redirects to FlashyID: GET /authorize?client_id=...&redirect_uri=...
3. FlashyID: Shows login screen
4. User logs in (Telegram, etc.)
5. FlashyID redirects back: GET /callback?code=...
6. App backend exchanges code: POST /token → { access_token, id_token }
7. App verifies token (signature check)
8. User authenticated
```

### Credential
A verifiable claim about the holder (e.g., "This is Alice").

```typescript
const cred = flashyid.verify(accessToken);
// cred.sub === "user:alice"
// cred.aud === "app:my-app"
// cred.exp === 1234567890
// cred.iat === 1234567800
```

Credentials:
- Are signed (RSA or ECDSA)
- Are verifiable without calling FlashyID (public key in JWKS)
- Expire (immutable expiry time)
- Cannot be revoked before expiry (explicit design choice)

### Grant
Delegated authority from one party to another.

```typescript
const grant = flashyid.mintGrant({
  holder: 'user:alice',
  delegatee: 'user:bob',
  authority: 'spend:usd',
  cap: toMinor('50.00'),
  expiry: Date.now() + 86400000
});
// grant.id === "grant:uuid-5678"
// Bob can now execute "spend:usd" up to $50 until tomorrow
```

Grants:
- Are attenuation-only (Bob's grant ⊂ Alice's authority)
- Constrain: scope (what), amount (how much), time (how long)
- Are revocable (Alice can revoke Bob's grant immediately)

### Attenuation
Delegation that narrows authority.

```typescript
// Alice: can spend $1000 per day
const alice = flashyid.getAuthority('user:alice');
// alice.cap === 100000 (Minor, $1000)

// Alice grants Bob $100 per day (narrower)
const bob = flashyid.attenuate(alice, {
  cap: toMinor('100.00')
});
// bob.cap === 10000 ($100)

// Bob grants Carol $50 (narrower than Bob's $100)
const carol = flashyid.attenuate(bob, {
  cap: toMinor('50.00')
});
// carol.cap === 5000 ($50)

// Carol tries to grant Dave $200 (wider than Carol's $50)
try {
  const dave = flashyid.attenuate(carol, {
    cap: toMinor('200.00')
  });
} catch (e) {
  // Error: ATTENUATION_VIOLATES_PARENT
}
```

## Basic Operations

### Authenticate

```typescript
// User logs in via OAuth (standard flow)
const code = req.query.code; // from authorization

const token = await flashyid.exchangeCode({
  code,
  client_id: process.env.FLASHYID_CLIENT_ID,
  client_secret: process.env.FLASHYID_CLIENT_SECRET
});

// token === { access_token: "...", id_token: "...", ... }
```

### Verify Credential

```typescript
const cred = flashyid.verify(token.id_token);

console.log(cred.sub);    // "user:alice"
console.log(cred.exp);    // 1234567890
console.log(cred.valid);  // true
```

### Mint a Grant

```typescript
const grant = flashyid.mintGrant({
  holder: 'user:alice',
  delegatee: 'user:bob',
  authority: 'spend:usd',
  cap: toMinor('50.00'),
  expiry: Date.now() + 86400000
});

// Bob now has authority to spend up to $50
```

### Attenuate (Delegate)

```typescript
// Bob grants Carol authority from his grant
const carol = flashyid.attenuate(bob, {
  cap: toMinor('25.00')  // narrower than Bob's $50
});

// Carol can now spend up to $25
```

### Verify Delegation Chain

```typescript
const chain = flashyid.resolveChain(carol);

// chain: [
//   { actor: 'alice', authority: $1000 },
//   { actor: 'bob', authority: $100 },
//   { actor: 'carol', authority: $50 }
// ]

// Proves: Alice → Bob → Carol, authority narrows at each step
```

### Revoke a Grant

```typescript
flashyid.revoke(bob);

// Bob's grant now refuses all operations
try {
  await rails.execute(draft, bob);
} catch (e) {
  // Error: GRANT_REVOKED
}
```

## Example: OAuth Flow

```typescript
import { FlashyID } from '@flashyid/sdk';

const flashyid = new FlashyID({
  clientId: process.env.FLASHYID_CLIENT_ID,
  clientSecret: process.env.FLASHYID_CLIENT_SECRET,
  issuer: 'https://id.flashyid.com'
});

// 1. Redirect to login (in a route)
app.get('/login', (req, res) => {
  const url = flashyid.authorizeUrl({
    redirect_uri: 'http://localhost:3000/callback',
    scope: 'openid profile'
  });
  res.redirect(url);
});

// 2. Handle callback
app.get('/callback', async (req, res) => {
  const token = await flashyid.exchangeCode({
    code: req.query.code,
    redirect_uri: 'http://localhost:3000/callback'
  });

  const cred = flashyid.verify(token.id_token);
  console.log(`User authenticated: ${cred.sub}`);

  res.send(`Hello ${cred.sub}!`);
});
```

## Example: Delegation Chain

```typescript
// Alice has $1000 spending authority
const alice = flashyid.getAuthority('user:alice');

// Alice grants Bob $100
const bob = flashyid.attenuate(alice, {
  cap: toMinor('100.00')
});

// Bob grants Carol $50
const carol = flashyid.attenuate(bob, {
  cap: toMinor('50.00')
});

// Verify the chain
const chain = flashyid.resolveChain(carol);

console.log(chain);
// [
//   { holder: 'user:alice', authority: 100000 },
//   { holder: 'user:bob', authority: 10000 },
//   { holder: 'user:carol', authority: 5000 }
// ]

// Carol can spend up to $50; every step narrows
```

## House Rules

- **Attenuation only.** Delegation can never widen authority
- **Explicit binding.** Subject binding persists; can't reassign credentials
- **Immediate revocation.** Revoked grants refuse all operations immediately
- **No hardcoded amounts.** Use `Minor` type; convert with `toMinor()` / `toGold()`

## Error Handling

```typescript
try {
  const cred = flashyid.verify(token);
} catch (e) {
  if (e.code === 'INVALID_SIGNATURE') {
    console.error("Token signature invalid");
  } else if (e.code === 'EXPIRED') {
    console.error("Token expired");
  } else if (e.code === 'UNTRUSTED_ISSUER') {
    console.error("Token issuer not trusted");
  }
}
```

## Testing Invariants

Tests verify:
- ✅ Grants narrow but never widen
- ✅ Expired grants refuse operations
- ✅ Revoked grants refuse operations
- ✅ Delegation chain is auditable
- ✅ Subject binding persists
- ✅ Attenuation constraints enforced

Run examples:
```bash
npm run examples:flashyid
npm test examples/04-flashyid-oauth
```

## Next Steps

- Try the [FlashyID Example](../../examples/04-flashyid-oauth) and run its tests
- Learn [Combined Workflow](combined-workflow.md) to see all systems together
- Read [FlashyID Identity](../architecture/flashyid-identity.md) for internals
