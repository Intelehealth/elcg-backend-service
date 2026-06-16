# users module

User model + repository. Backs EZ-932 login + EZ-939 password reset.

Files to add as you implement:
- `user.model.ts` — Sequelize model (id, uuid, username, password_hash, phone, role, locked_until, failed_attempts, …)
- `user.repository.ts` — Sequelize queries
- `user.test.ts`
