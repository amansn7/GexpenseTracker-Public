// @ts-nocheck

const _b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const _bufToB64url = (buf) => {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const _serializeCred = (c) => ({
  id: c.id, type: c.type, rawId: _bufToB64url(c.rawId),
  response: {
    clientDataJSON: _bufToB64url(c.response.clientDataJSON),
    attestationObject: _bufToB64url(c.response.attestationObject),
  },
  transports: c.response.getTransports?.() ?? [],
});

const _serializeAssertion = (c) => ({
  id: c.id, type: c.type, rawId: _bufToB64url(c.rawId),
  response: {
    clientDataJSON: _bufToB64url(c.response.clientDataJSON),
    authenticatorData: _bufToB64url(c.response.authenticatorData),
    signature: _bufToB64url(c.response.signature),
  },
});

const registerPasskey = async (deviceName) => {
  try {
    const begin = await API.post("/api/auth/passkey/register/begin");
    const opts = begin.options;
    opts.challenge = _b64url(opts.challenge);
    opts.user.id = _b64url(opts.user.id);
    const credential = await navigator.credentials.create({ publicKey: opts });
    const credentialData = credential.toJSON ? credential.toJSON() : _serializeCred(credential);
    const complete = await API.post("/api/auth/passkey/register/complete", {
      credential: credentialData,
      challenge_b64: begin.challenge_b64,
      challenge_sig: begin.challenge_sig,
      device_name: deviceName || "Passkey",
    });
    return { ok: complete.ok };
  } catch (e) {
    return { ok: false, error: e.message || "Passkey registration failed" };
  }
};

const assertPasskey = async () => {
  try {
    const begin = await API.post("/api/auth/passkey/assert/begin");
    const pkOptions = begin.options;
    pkOptions.challenge = _b64url(pkOptions.challenge);
    const credential = await navigator.credentials.get({ publicKey: pkOptions });
    const assertionData = credential.toJSON ? credential.toJSON() : _serializeAssertion(credential);
    const complete = await API.post("/api/auth/passkey/assert/complete", {
      credential: assertionData,
      challenge_b64: begin.challenge_b64,
      challenge_sig: begin.challenge_sig,
    });
    return { ok: complete.ok };
  } catch (e) {
    return { ok: false, error: e.message || "Passkey assertion failed" };
  }
};

Object.assign(window as any, { registerPasskey, assertPasskey });
