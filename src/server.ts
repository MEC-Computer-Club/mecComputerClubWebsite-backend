import "./config/env";
import app from "./app";
import { connectDB } from "./config/db.config";

const PORT = Number(process.env.PORT || 4000);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

// If not on Vercel serverless, run normal standalone listener
if (!process.env.VERCEL) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Serverless handler for Vercel deployment
export default async function handler(req: any, res: any) {
  await connectDB();
  return (app as any)(req, res);
}
