# Google OAuth Verification Research

> Research notes for getting MoneyFlow's Google OAuth consent screen verified.
> GexpenseTracker/MoneyFlow — May 25, 2026

## 1. Current OAuth Scopes

Defined in `app/gmail/auth.py:12-17`:

```
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]
```

| Scope | Type | Sensitivity |
|-------|------|-------------|
| `openid` | OpenID Connect | Non-sensitive |
| `userinfo.email` | User identity | Non-sensitive |
| `userinfo.profile` | User identity | Non-sensitive |
| `gmail.readonly` | Gmail API | **Restricted** ⚠️ |

**`gmail.readonly` is classified by Google as a Restricted scope** and requires full Google OAuth verification, including a security assessment.

## 2. Google Cloud Project Requirements

To prepare for OAuth consent screen verification, the Google Cloud project must have:

- [ ] **OAuth consent screen configured** (User Type: External for public use, Internal for self-hosted)
- [ ] **App name, logo, and support email** registered in Google Cloud Console
- [ ] **Authorized domains** set up (including the app's domain)
- [ ] **Privacy policy URL** linked
- [ ] **Terms of service URL** linked
- [ ] **Scopes justification** for each restricted scope
- [ ] **App domain ownership verified** via Google Search Console

### Self-hosted consideration
Because MoneyFlow is self-hosted, each instance has a different domain. Google's verification is tied to a specific domain. This means:
- If distributed publicly, users would need to create their own Google Cloud project
- OR the project maintains a "reference domain" that Google verifies, and users deploy elsewhere

**Recommendation:** Document that users must create their own Google Cloud project for OAuth. The app's verified domain would only apply to the project operator's instance.

## 3. Restricted Scope Verification (Gmail API)

`gmail.readonly` requires a **Google Cloud Security Assessment**:

1. **Video walkthrough**: Google may require a screencast showing how the scope is used
2. **Privacy policy**: Must detail how Gmail data is accessed, stored, and deleted
3. **Limited use disclosure**: Must comply with Google's Limited Use requirements
4. **Verification timeline**: Can take 4-6 weeks (sometimes longer)
5. **Annual re-verification**: Restricted scopes require annual re-verification

### Justification for gmail.readonly
The app uses Gmail to:
- Read financial transaction emails (receipts, statements, payment confirmations)
- Extract transaction metadata (amount, merchant, date)
- Display email context alongside transactions

Justification narrative: "The app reads email metadata and content solely to extract financial transaction information. No Gmail data is used for advertising, user profiling beyond expense categorization, or any AI training unrelated to the user's own transaction classification."

## 4. App Domain Requirements

### Required URLs for verification
- **Privacy policy URL**: Must be publicly accessible on the app domain
- **Terms of service URL**: Must be publicly accessible on the app domain
- **App domain**: Must be verified via Google Search Console

### For self-hosted deployments
Since each deployment is on a different domain:
- The open-source repository should provide **template** privacy policy and ToS
- Each operator is responsible for hosting these on their own domain
- The Google Cloud project used by each operator must have their domain verified

## 5. Current Redirect URIs

From `.env.example`:
```
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/callback
```

From `app/config.py`:
```python
GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/auth/callback"
```

### In Google Cloud Console, the following redirect URIs must be registered:
- `http://localhost:8000/api/auth/callback` (dev)
- `https://<your-domain>/api/auth/callback` (production)

### JavaScript origins (if using Google Sign-In):
- `http://localhost:8000` (dev)
- `https://<your-domain>` (production)

## 6. Steps to Get the App Verified

### Phase 1: Preparation
1. [ ] Create a Google Cloud project (or use existing)
2. [ ] Enable the Gmail API
3. [ ] Configure OAuth consent screen (External)
4. [ ] Add all required scopes: `openid`, `userinfo.email`, `userinfo.profile`, `gmail.readonly`
5. [ ] Add test users (up to 100 without verification)
6. [ ] Register redirect URIs for dev + production

### Phase 2: Policies (required for verification)
1. [ ] Host **Privacy Policy** at `https://<domain>/privacy`
2. [ ] Host **Terms of Service** at `https://<domain>/terms`
3. [ ] Ensure policies cover Google's Limited Use requirements
4. [ ] Verify app domain in Google Search Console

### Phase 3: Submission
1. [ ] Submit OAuth consent screen for verification
2. [ ] Include screencast/video demonstrating gmail.readonly usage
3. [ ] Provide written justification for each restricted scope
4. [ ] Submit security assessment questionnaire (if requested)

### Phase 4: Ongoing
1. [ ] Monitor verification status in Google Cloud Console
2. [ ] Respond to Google review requests within timeframe
3. [ ] Update privacy policy as data practices change
4. [ ] Re-verify annually

## Key Reference Links
- [OAuth verification FAQ](https://support.google.com/cloud/answer/9110914)
- [Restricted scopes list](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Limited Use requirements](https://developers.google.com/terms/api-services-user-data-policy)
- [Google Cloud Security Assessment](https://support.google.com/cloud/answer/7458765)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Self-hosted model complicates domain verification | High | Template policies; document BYO-Google-Cloud-Project approach |
| Gmail API scope changes | Medium | Monitor Google API deprecation notices |
| Verification rejected (justification insufficient) | Medium | Strong justification narrative; video walkthrough |
| Verification delays | Low | Start early; internal testing possible without verification for ≤100 users |
| Annual re-verification burden | Low | Calendar reminder; minimal changes expected year-to-year |
