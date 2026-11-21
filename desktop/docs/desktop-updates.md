# Desktop release signing

CheezyClash reads stable releases from `l0nelynx/CheezyClash`. CheezyVPN is built in `l0nelynx/CheezyVPN_android` and reads stable releases from `l0nelynx/CheezyVPN-Releases`. Product identity and the verification key are embedded when the main process is built.

Configure a separate Ed25519 key pair in each **source** repository before tagging the first updater-enabled release. Generate each pair once on a trusted machine and retain an encrypted backup. For example, in a private directory outside the checkout:

```sh
openssl genpkey -algorithm Ed25519 -out desktop-update-private.pem
openssl pkey -in desktop-update-private.pem -pubout -out desktop-update-public.pem
gh secret set DESKTOP_UPDATE_PRIVATE_KEY --repo OWNER/SOURCE_REPOSITORY < desktop-update-private.pem
gh variable set DESKTOP_UPDATE_PUBLIC_KEY --repo OWNER/SOURCE_REPOSITORY < desktop-update-public.pem
```

Use the full multiline PEM for both values. Only the publish job receives the private key. Local builds without a public key provide the release link. Release builds require the public key, and publication requires the matching private key. Keep using the same key for subsequent releases. Changing it requires a transition release trusted by existing clients or a manual installation.

The signing job checks all eight desktop files, signs the exact bytes of `desktop-update.json`, and publishes the detached binary `desktop-update.sig` alongside the installers. Clients pin downloads to the selected version tag. The first updater-enabled build must be installed using the existing release link.

On Windows an installed NSIS copy upgrades in place. Portable users extract the downloaded ZIP. Linux uses the current AppImage path or asks polkit to authorize installation of the local DEB. Both products retain their historical Debian package name `cheezyclash-desktop`. On macOS the client opens the DMG matching its own architecture and the user replaces the app in Applications.
