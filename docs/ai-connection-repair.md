# AI connection repair

User supplied production support code MYLA_CONNECTION. The web mapping identifies an HTTP 401/403 from the backend path, before model generation; it does not distinguish gateway rejection from function rejection.

## Configuration action

Retrieved the correct project's service-role credential using the authorized Supabase connector and replaced the existing Vercel SUPABASE_SERVICE_ROLE_KEY value. Kept the variable sensitive and preserved its existing environment targets (production, preview and development). No credential was written to repository files. No public/browser variable or AI-provider secret was changed. The prior sensitive Vercel value was not inspected, so its type and exact mismatch cannot be established.

Triggered a production deployment of unchanged application commit 24d654785764d661509591a714e8c2e747b54ee9 to load the updated environment. Deployment ID: dpl_4mLtHfBaXAwPwi5fWj4thvBTboR6.

This is a targeted authentication-configuration repair, not proof of end-to-end generation. Confirm deployment readiness and a real authenticated AI result before signing off. Do not weaken access controls or introduce a paid-model fallback to compensate for unrelated failures.

## Follow-up: repeated MYLA_CONNECTION after Ask-only release

Compared the project credential configured in Vercel with live Supabase secret metadata: its SHA-256 does not match the built-in Edge SUPABASE_SERVICE_ROLE_KEY digest. The previous exact-equality assumption was therefore invalid for these two credentials.

Configured MYLA_BACKEND_KEY in Supabase to explicitly trust the same project service-role credential. Verified its returned digest matches locally without writing the credential to any repository file. Edge now accepts this explicit credential as well as its existing trusted project credentials. Usage reservation uses the exact validated incoming project credential instead of substituting the mismatched built-in one. Public and unrelated credentials remain rejected.

Deployed backend ACTIVE version 7. Added regression coverage for different runtime/explicit keys and verified the RPC uses the validated credential. Ask-only UI remains unchanged. Live successful generation is still unconfirmed; deployment and fingerprint checks establish configuration alignment, not an end-to-end result.
