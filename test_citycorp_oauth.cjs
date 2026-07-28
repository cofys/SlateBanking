async function test() {
    const keys1 = ["client_id", "app_id"];
    const keys2 = ["client_secret", "app_secret", "token"];
    const keys3 = ["code", "token", "client_secret", "auth_code"];

    for (const k1 of keys1) {
        for (const k2 of keys2) {
            for (const k3 of keys3) {
                if (k2 === k3) continue; // Don't use the same key twice

                const params = {
                    grant_type: "authorization_code",
                    redirect_uri: "https://example.com/callback",
                    [k1]: "94a1ad60-bffa-4508-824e-d604277a5527",
                    [k2]: "fake_app_secret",
                    [k3]: "fake_auth_code"
                };

                const bodyParams = new URLSearchParams(params);
                const res = await fetch("https://dashboard.cityrp.org/oauth/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
                    body: bodyParams.toString()
                });
                const text = await res.text();
                if (!text.includes("invalid_request")) {
                    console.log(`FOUND: ${k1}=app_id, ${k2}=app_secret, ${k3}=auth_code => ${res.status} ${text}`);
                }
            }
        }
    }
}
test();
