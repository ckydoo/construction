/* Switch the Prisma datasource from SQLite to PostgreSQL for managed deployments. */
import fs from 'node:fs';
const schema='prisma/schema.prisma';
let s=fs.readFileSync(schema,'utf8');
if(s.includes('provider = "postgresql"')){ console.log('Already configured for PostgreSQL.'); process.exit(0); }
s=s.replace(/provider\s*=\s*"sqlite"/,'provider = "postgresql"');
fs.writeFileSync(schema,s);
console.log('✓ prisma/schema.prisma now uses the PostgreSQL provider.');
console.log('Next steps:');
console.log('  1. Set DATABASE_URL to your Postgres connection string in .env / host env vars');
console.log('  2. npx prisma generate && npx prisma db push');
console.log('  3. npm run build && npm run start:prod   (or deploy)');
console.log('To revert: change provider back to "sqlite" and set DATABASE_URL="file:./dev.db"');
