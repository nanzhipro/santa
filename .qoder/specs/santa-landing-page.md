# Santa Landing Page - Implementation Plan

## Overview
Replace the current redirect-only homepage (`index.tsx`) with a professional landing page targeting enterprise security teams. Content in Chinese, clean light theme, built with existing Docusaurus + Tailwind + shadcn stack.

## Files to Modify/Create

### 1. `docs/src/pages/index.tsx` (MODIFY - main entry)
Replace the redirect with a full landing page using Docusaurus `Layout` component. All section components will be defined in separate files under a `LandingPage/` directory.

### 2. `docs/src/components/LandingPage/` (CREATE - directory with section components)
Create the following component files:
- `Hero.tsx` - Hero section
- `Features.tsx` - Core features grid
- `HowItWorks.tsx` - Architecture/workflow explanation with santa-block.gif
- `Screenshots.tsx` - Product UI screenshots
- `WhySanta.tsx` - Differentiators for enterprise
- `CTA.tsx` - Final call-to-action

### 3. `docs/src/css/custom.css` (MODIFY - minimal additions)
Add landing-page-specific styles if needed (e.g., hiding sidebar/TOC on the landing page). Most styling via Tailwind classes.

## Section Design

### Hero
- Large Santa logo (use existing `/img/santa-black.svg`, auto-switch dark via `useColorMode`)
- H1: "macOS 企业级终端安全授权系统"
- Subtitle: Brief value proposition for enterprise security teams
- Two CTAs: "开始使用" (link to `/intro`) + "GitHub" (external link)
- Clean gradient background: `bg-gradient-to-b from-white to-gray-50`

### Features (4-column grid)
Four core features with Lucide icons:
1. **二进制授权** (Shield) - Monitor/Lockdown/Standalone modes
2. **文件访问授权** (FileCheck) - FAA capabilities
3. **外部设备管控** (Usb) - USB/SD blocking
4. **灵活策略引擎** (Code2) - CEL rules + code signing

### How It Works
Step-by-step flow with numbered steps:
1. System Extension monitors execution via Endpoint Security
2. Policy engine evaluates rules (CDHash, Certificate, CEL)
3. GUI notifies user on block decisions
4. Sync service manages remote configuration
Include `santa-block.gif` as a visual demo.

### Screenshots
3-column grid showing:
- Binary auth dialog (`binary-auth-dialog_light.png` / `_dark.png`)
- FAA dialog (`faa-dialog_light.png` / `_dark.png`)
- USB dialog (`usb-dialog_light.png` / `_dark.png`)
Use existing CSS `[data-theme] img[src$="#dark/#light"]` pattern for theme switching.

### Why Santa (2-column grid, 6 items)
Key differentiators with icons:
1. 开源透明 (GitBranch) - Apache 2.0
2. 久经验证 (Award) - Battle-tested by enterprises worldwide
3. 高性能 (Zap) - Kernel-level with smart caching
4. 灵活部署 (Settings) - Multiple modes, MDM support
5. 集中管理 (Server) - Sync servers (Workshop, Moroz, etc.)
6. 全面审计 (BarChart3) - Rich telemetry and event logging

### CTA
- Headline: "准备好保护您的 macOS 设备了吗？"
- Two buttons: "查看文档" + "下载最新版本" (GitHub releases)
- Subtle primary-tinted background

## Technical Approach

### Imports & Dependencies (all already available)
```tsx
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import { useColorMode } from "@docusaurus/theme-common";
import { Button } from "@site/src/components/shadcn/button";
import { Shield, FileCheck, Usb, Code2, ... } from "lucide-react";
```

### Styling Strategy
- Tailwind utility classes for all layout and spacing
- Use existing theme CSS variables (`bg-background`, `text-foreground`, `text-primary`, etc.)
- Responsive: mobile-first with `md:` and `lg:` breakpoints
- Cards: `bg-card border border-border rounded-lg p-6`
- Section spacing: `py-20 md:py-28`
- Max content width: `max-w-6xl mx-auto px-4`

### Page Layout
- Use `<Layout title="..." description="...">` wrapper (no sidebar)
- Docusaurus pages (under `src/pages/`) don't show docs sidebar by default
- Existing navbar and footer remain intact
- Announcement bar remains visible

### Image Theme Switching
Use the existing CSS convention already in `custom.css`:
```html
<img src="/img/binary-auth-dialog_light.png#light" />
<img src="/img/binary-auth-dialog_dark.png#dark" />
```

### SEO
- `<Layout title="Santa - macOS 企业级终端安全授权系统" description="...">`
- Semantic HTML (h1, h2, sections)

## Verification
1. Run `cd /data/workspace/santa/docs && pnpm install && pnpm start` to start dev server
2. Verify landing page renders at `http://localhost:3000/`
3. Check all sections display correctly
4. Test responsive layout (narrow viewport)
5. Verify all links work (intro page, GitHub)
6. Verify light/dark theme switching for screenshots and logo
7. Run `pnpm build` to ensure no build errors
