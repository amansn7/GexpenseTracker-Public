// @ts-nocheck

const setupTOTP = async () => {
  try {
    const result = await API.post("/api/account/2fa/setup");
    return { qr_url: result.qr_url, secret: result.secret };
  } catch (e) {
    return { qr_url: "", secret: "", error: e.message || "Could not start 2FA setup" };
  }
};

const verifyTOTP = async (code) => {
  try {
    const result = await API.post("/api/account/2fa/verify", { code });
    if (result.ok) return { ok: true };
    return { ok: false, error: result.error || "Invalid code" };
  } catch (e) {
    return { ok: false, error: e.message || "Verification failed" };
  }
};

const disableTOTP = async () => {
  try {
    await API.delete("/api/account/2fa");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || "Failed to disable 2FA" };
  }
};

Object.assign(window as any, { setupTOTP, verifyTOTP, disableTOTP });
