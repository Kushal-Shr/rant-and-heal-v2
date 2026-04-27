This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Technical Architecture

This project is built with a modern, high-performance web stack tailored for security, scalability, and developer experience.

### Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Authentication**: Firebase 10+
- **Type Safety**: TypeScript
- **Runtime Validation**: Zod

### Security Features
- **Server-Side Protection**: Leveraging Next.js Edge Middleware combined with `js-cookie` to strictly protect private routes (e.g., `/dashboard`, `/journal`) before the page even loads.
- **Environment Safety**: Comprehensive runtime validation of API keys using Zod. This prevents silent failures by immediately alerting developers to missing or malformed environment variables.
- **Encryption Ready**: The architecture is inherently designed to support an AES-256 implementation layer for the journal feature, ensuring end-to-end data confidentiality.

### Architecture Patterns
- **Service-Oriented Architecture (SOA)**: Authentication logic is heavily decoupled from UI components into a dedicated `authService`, improving maintainability and testability.
- **Global State Management**: High-performance React Context (`AuthProvider`) orchestrates the user session state seamlessly with Firebase's observers to prevent UI flickering and hydration mismatches.

### How to Run
1. Create a `.env.local` file in the root directory and add your Firebase configuration variables.
2. Install the necessary dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
