async function test() {
    const bodyParams = new URLSearchParams({
        grant_type: "authorization_code",
        client_secret: "1e908d0fb9f0d089ec22cb43d528c54e0b9e8f88f2705ccfae287096cb85e4a2", // the code
        app_id: "94a1ad60-bffa-4508-824e-d604277a5527", 
        token: "1e908d0fb9f0d089ec22cb43d528c54e0b9e8f88f2705ccfae287096cb85e4a2" // assuming the token is the same here for test
    });

    const res = await fetch("https://dashboard.cityrp.org/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString()
    });
    console.log(res.status);
    console.log(await res.text());
}
test();
