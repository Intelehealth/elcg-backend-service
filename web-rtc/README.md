# web-rtc

LiveKit token issuance + Socket.IO v4 signalling.

**Status: stub.** Will land in the teleconsult sprint. Healthcheck is up.

Critical fix to remember when implementing token endpoint:
- **R-01: JWT auth middleware MUST be re-enabled** on `GET /webrtc/token` (legacy had it disabled).

Port: `3003`.
