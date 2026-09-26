import dotenv from "dotenv";
import path from "path";

// Load .env.local first, falling back to .env
dotenv.config({ path: [path.resolve(process.cwd(), ".env.local"), path.resolve(process.cwd(), ".env")] });
