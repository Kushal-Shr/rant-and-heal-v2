import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../../.env.local"), quiet: true });

const secretName = process.env.AWS_RUNTIME_SECRET_NAME ?? "rant-and-heal/runtime";
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const names = [
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "MOMO_SAFETY_IDENTIFIER_SECRET",
  "TURN_USERNAME",
  "TURN_CREDENTIAL",
  "RESEND_API_KEY",
];

const secret = Object.fromEntries(names.map((name) => [name, process.env[name] ?? ""]));
const required = [
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "MOMO_SAFETY_IDENTIFIER_SECRET",
];
const missing = required.filter((name) => !secret[name]);
if (missing.length) throw new Error(`Missing required secrets in .env.local: ${missing.join(", ")}`);

function aws(args, options = {}) {
  return spawnSync("aws", [...args, "--region", region], {
    encoding: "utf8",
    ...options,
  });
}

const description = aws(["secretsmanager", "describe-secret", "--secret-id", secretName]);
const input = JSON.stringify(secret);
let result;
if (description.status === 0) {
  result = aws([
    "secretsmanager",
    "put-secret-value",
    "--secret-id",
    secretName,
    "--secret-string",
    "file:///dev/stdin",
  ], { input });
} else if (description.stderr.includes("ResourceNotFoundException")) {
  result = aws([
    "secretsmanager",
    "create-secret",
    "--name",
    secretName,
    "--description",
    "Rant and Heal ECS runtime credentials",
    "--secret-string",
    "file:///dev/stdin",
  ], { input });
} else {
  process.stderr.write(description.stderr);
  process.exit(description.status ?? 1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
console.log(`Synced ${names.length} values to AWS Secrets Manager secret ${secretName}.`);
