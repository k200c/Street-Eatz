# Street Eatz App Store readiness

## Foundation now in the repository

- Bundle identifier: `ie.streeteatzwaterford.app`
- Display name: `Street Eatz`
- Capacitor iOS runtime and CLI are pinned to the same version.
- The production web build remains the source for the PWA and the native shell.
- `npm run ios:sync` builds the web app and copies it into the iOS project.
- The install page supports an App Store link through `VITE_APP_STORE_URL`; it remains visibly disabled until a real listing URL is supplied.

## Mac and Apple account work

1. On a Mac with the current supported Xcode release, run `npm run ios:add` once and then `npm run ios:sync`.
2. Open the project with `npm run ios:open` and select the Apple Developer team.
3. Confirm or register the App ID `ie.streeteatzwaterford.app` in Apple Developer.
4. Create the App Store Connect record before uploading the first archive.
5. Configure the signing certificate, provisioning profile, privacy details and required capabilities.
6. Add the final App Store URL to Netlify as `VITE_APP_STORE_URL` after the listing exists, then redeploy.

## Release gates before submission

- Complete real-device testing for sign-in, account deletion, menu, QR/deep links, ordering, payment return, order status, loyalty and notifications.
- Verify the native app never depends on an HTTP-only or local URL.
- Add native value beyond a simple website wrapper. The planned first release should include push order-status notifications, native deep links and a native loyalty pass or wallet experience.
- Complete Apple privacy declarations against the actual data flows and linked SDKs.
- Supply 1024px artwork, iPhone/iPad screenshots, support URL, privacy-policy URL, review notes and a reviewer account.
- Use TestFlight for internal testing, then a small external group, before production review.

## Payments note

The current web checkout remains unchanged by the Capacitor foundation. Before App Store submission, test the payment-provider return flow on a physical iPhone. Apple Pay for physical food orders is allowed in principle, but merchant entitlement, domain verification and payment-provider support must all be configured and tested separately.
