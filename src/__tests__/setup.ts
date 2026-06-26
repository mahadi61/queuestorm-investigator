/**
 * Jest global setup — runs before each test file.
 * Sets NODE_ENV=test so index.ts skips app.listen()
 * and loads .env so OPENROUTER_API_KEY is available.
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

process.env.NODE_ENV = 'test';
