async function test() {
    async function tryParams(params) {
        const bodyParams = new URLSearchParams(params);
        const res = await fetch("https://api.cityrp.org/auth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: bodyParams.toString()
        });
        console.log(JSON.stringify(params), "=>", res.status, await res.text());
    }

    await tryParams({
        grant_type: "authorization_code",
        client_secret: "fake_code"
    });
}
test();
