This is a [Next.js](https://nextjs.org) app that fetches a CSV (including a Google Sheet published as CSV) and displays the raw rows in a basic dashboard.

## Getting Started

### 1) Configure your CSV URL

Copy the example env file, then set `SHEET_CSV_URL`:

```bash
cp .env.local.example .env.local
```

To get a Google Sheet CSV URL:

- In Google Sheets: **File → Share → Publish to web**
- Choose the desired **sheet/tab** and select **Comma-separated values (.csv)**
- Copy the generated link and paste it as `SHEET_CSV_URL`

### 2) Run the dev server

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000` and click **Open dashboard** (or go to `/dashboard`).

### Notes

- The dashboard calls `GET /api/data`, which fetches `SHEET_CSV_URL` and parses it as CSV.
- Your `SHEET_CSV_URL` must be accessible from your machine/server (public or otherwise reachable in the environment you run this app).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
