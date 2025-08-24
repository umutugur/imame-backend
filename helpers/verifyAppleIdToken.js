// helpers/verifyAppleIdToken.js
const { createRemoteJWKSet, jwtVerify } = require('jose');

const ISS = ['https://appleid.apple.com'];
const AUD = process.env.APPLE_SERVICE_ID || process.env.IOS_BUNDLE_ID; 
// servis tipi: Web için Service ID, native için bundle id

const JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

exports.verifyAppleIdToken = async (idToken) => {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ISS,
    audience: AUD, // burada uygulamanın audience’ı eşleşmeli
  });
  return payload; // sub, email (varsa), email_verified vs.
};
