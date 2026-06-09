# Deep Linking Configuration — MoneyFlow

## iOS (Configured)

### Custom URL Scheme: `moneyflow://`

The iOS project at `ios/App/App/Info.plist` is configured with:
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>com.gexpense.moneyflow</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>moneyflow</string>
        </array>
    </dict>
</array>
```

### Universal Links (Apple App Site Association)

To enable Universal Links:
1. Add `apple-app-site-association` file to your server's `/.well-known/` directory:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.gexpense.moneyflow",
        "paths": ["*"]
      }
    ]
  }
}
```

2. Enable Associated Domains capability in Xcode:
   - Open `ios/App/App.xcworkspace` in Xcode
   - Under Signing & Capabilities, add "Associated Domains"
   - Add `applinks:your-production-domain.com`

### Handling Deep Links in Capacitor

```javascript
import { App } from '@capacitor/app';

App.addListener('appUrlOpen', (data) => {
  const url = new URL(data.url);

  if (url.hostname === 'auth' && url.pathname === '/callback') {
    // Handle OAuth callback
    const code = url.searchParams.get('code');
    exchangeCodeForSession(code);
  }

  if (url.pathname.startsWith('/transaction/')) {
    const id = url.pathname.split('/')[2];
    navigateToTransaction(id);
  }
});
```

## Android (Plan — Not Yet Set Up)

### Custom URL Scheme: `moneyflow://`

Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="moneyflow" />
</intent-filter>
```

### App Links (Android)

Add to `AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="your-production-domain.com"
        android:pathPrefix="/" />
</intent-filter>
```

## Production Setup Checklist

- [ ] Register `moneyflow://` URL scheme with Google Cloud Console (OAuth)
- [ ] Add `apple-app-site-association` file to server `/.well-known/`
- [ ] Add `assetlinks.json` (Android) to server `/.well-known/`
- [ ] Test deep links with `xcrun simctl openurl booted "moneyflow://..."` (iOS)
- [ ] Test deep links with `adb shell am start -W -a android.intent.action.VIEW -d "moneyflow://..."` (Android)
