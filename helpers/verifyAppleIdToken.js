// helpers/verifyAppleIdToken.js
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ISSUER = 'https://appleid.apple.com';

// Native iOS için bundle id, web akışı kullanıyorsan service id.
// .env'de en az IOS_BUNDLE_ID tanımlı olmalı.
const ALLOWED_AUDIENCES = [
  process.env.IOS_BUNDLE_ID,     // örn: com.umutugur.imame  (native)
  process.env.APPLE_SERVICE_ID,  // örn: com.umutugur.imame.web (web; opsiyonel)
].filter(Boolean);

const JWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

exports.verifyAppleIdToken = async (idToken) => {
  // 1) İmza + iss + exp/nbf doğrulaması
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISSUER,          // tek string olmalı
    clockTolerance: 60,      // saniye (küçük tolerans)
  });

  // 2) aud çoklu kontrol (native/web için)
  const aud = payload?.aud;
  if (!aud || !ALLOWED_AUDIENCES.includes(aud)) {
    // Loglamak istersen: console.warn('Apple JWT invalid aud:', aud, ALLOWED_AUDIENCES);
    throw new Error('Invalid audience for Apple identity token');
  }

  // İsteğe bağlı ek kontroller:
  // if (payload?.email_verified === 'false') { ... }

  return payload; // sub, email (olabilir), email_verified, etc.
};