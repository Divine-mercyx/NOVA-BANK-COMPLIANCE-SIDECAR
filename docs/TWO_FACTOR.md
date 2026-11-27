# Two-factor sign-in (authenticator app)

Staff sign in with their **password** and a **6-digit code from an authenticator app** on their phone (Google
Authenticator, Microsoft Authenticator, 1Password or Authy). Nothing is sent by SMS or email, so there is no
message provider to buy, no per-message cost, and it works on a closed bank network.

## For staff

- **First sign-in:** after the password, a screen shows a QR code. Scan it with the app, type the code the app
  shows, then save the ten **recovery codes** (copy or download). Then the portal opens.
- **Every later sign-in:** password, then the 6-digit code from the app.
- **Lost phone:** use a recovery code instead (each works once). If there are none left, ask an administrator.
- A code works **once**: the same code cannot be used again, even within its 30 seconds.

## For administrators

- **Team** page: each person shows "Authenticator on" or "Not set up yet".
- **Lost phone, no recovery codes:** Team → the key icon on that person → *Reset two-factor sign-in*. Their old app
  and codes stop working; they sign in with their password and set up a new app. Needs the *team.manage*
  permission; you cannot reset your own. The reset is written to the audit trail.
- Audit trail events: `TWO_FACTOR_ENABLED`, `TWO_FACTOR_RECOVERY_USED`, `TWO_FACTOR_RECOVERY_CODES_REPLACED`,
  `TWO_FACTOR_LOCKED_OUT`, `TWO_FACTOR_RESET`, and `LOGIN_SUCCESS` (with how the person signed in).

## For the IT team

| Setting | Meaning |
|---|---|
| `TWO_FACTOR_KEY` | Seals each person's authenticator key in the database (AES-256-GCM). 32 random bytes as hex: `python -c "import secrets; print(secrets.token_hex(32))"`. Keep it **outside the database** (secrets manager or server environment). If empty it is derived from `JWT_SECRET`. **Changing it makes every stored authenticator key unreadable**: everyone is reset and sets up again. |
| `TWO_FACTOR_ISSUER` | The name the app shows (default `Nova Compliance`). |
| `TWO_FACTOR_CHALLENGE_MINUTES` / `TWO_FACTOR_SETUP_MINUTES` | How long a person has to type the code after the password (5) and to finish first-time setup (15). |
| `TWO_FACTOR_MAX_ATTEMPTS` | Wrong codes allowed per sign-in before it must be started again (5). |

- **Existing accounts** need no action: the database is upgraded on start (migration `010_two_factor`) and each
  person sets up the app at their next sign-in. Nobody can use the portal with a password alone.
- The server's **clock** must be right (NTP): codes are time-based. One 30-second step of drift either side is tolerated.
- Recovery codes are stored only as keyed hashes; authenticator keys only sealed. Neither can be read from a database backup without `TWO_FACTOR_KEY`.
- Standard: RFC 6238 (TOTP), checked against the RFC's published test vectors.
