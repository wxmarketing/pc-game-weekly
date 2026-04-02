PC 游戏行业周报（自动化）

## 功能

- Steam Top Sellers 每日快照（最小存储：appid + rank + captured_at）
- 周报页 `/report`：Steam 榜单变化、各平台数据与静态指标（根路径会重定向到此页）

## 初始化（Supabase）

1. 在 Supabase 项目中执行 `supabase/schema.sql`
2. 在 Vercel 环境变量中配置（或本地 `.env.local`）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
   - `CRON_SECRET`（保护 Cron 接口）

## 定时任务（Vercel Cron）

项目内 `vercel.json` 已配置每日触发：

- 路径：`/api/cron/steam/top-sellers?cc=CN`
- 时间：`30 16 * * *`（UTC；约等于北京时间 00:30）

Cron 请求需要带 header：`x-cron-secret: <CRON_SECRET>`。

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
