# Deployment Guide

This guide covers deploying the Cerebro RAG application to production.

## Deployment Options

### 1. Lovable Platform (Recommended)

The easiest deployment method with zero configuration.

**Advantages**:
- One-click deployment
- Automatic SSL certificates
- CDN integration
- Edge function deployment
- Database migrations
- Custom domain support
- Real-time preview updates

**Steps**:

1. **Publish App**
   - Click "Publish" button in Lovable editor (top-right)
   - Your app deploys automatically to `[project-name].lovable.app`
   - First deployment takes ~2-3 minutes

2. **Configure Custom Domain** (Optional)
   ```
   Settings → Domains → Add Custom Domain
   ```
   - Enter your domain (e.g., `app.yourdomain.com`)
   - Follow DNS configuration instructions
   - SSL certificate auto-generated
   - Propagation takes 10-60 minutes

3. **Environment Management**
   - All secrets managed in Settings → Secrets
   - Edge functions deployed automatically
   - Database already configured

**Costs**:
- Free tier available
- Custom domains require paid plan
- Usage-based pricing for backend

---

### 2. Self-Hosting

Deploy to your own infrastructure while keeping Supabase backend.

#### Prerequisites
- Node.js 18+ or compatible runtime
- Static hosting (Vercel, Netlify, Cloudflare Pages, etc.)
- Supabase project (for backend)

#### Build Process

1. **Install Dependencies**
   ```bash
   npm install
   # or
   bun install
   ```

2. **Configure Environment Variables**
   
   The app expects these variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
   VITE_SUPABASE_PROJECT_ID=your_project_id
   ```

   **Important**: These are injected at build time with `VITE_` prefix.

3. **Build Application**
   ```bash
   npm run build
   ```
   
   This creates a `dist/` folder with optimized static files.

4. **Test Build Locally**
   ```bash
   npm run preview
   ```
   
   Serves the production build at `http://localhost:4173`

#### Deployment Targets

**Vercel**:
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Configure environment variables in Vercel dashboard
```

**Netlify**:
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist

# Configure environment variables in Netlify dashboard
```

**Cloudflare Pages**:
```bash
# Build command
npm run build

# Publish directory
dist

# Set environment variables in Cloudflare dashboard
```

**AWS S3 + CloudFront**:
```bash
# Build
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DIST_ID \
  --paths "/*"
```

**Docker**:
```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

Deploy:
```bash
docker build -t cerebro-rag .
docker run -p 80:80 cerebro-rag
```

---

## Backend Deployment

### Supabase Setup

1. **Create Supabase Project**
   ```
   https://supabase.com/dashboard
   → New Project
   → Name: cerebro-production
   → Region: Choose closest to users
   → Database Password: Generate strong password
   ```

2. **Enable Extensions**
   ```sql
   -- In SQL Editor
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **Run Migrations**
   
   Copy SQL from `supabase/migrations/` and run in SQL Editor:
   ```sql
   -- Run each migration file in order
   -- 001_initial_schema.sql
   -- 002_rls_policies.sql
   -- etc.
   ```

4. **Deploy Edge Functions**
   
   If using Lovable Cloud, functions deploy automatically.
   
   For standalone Supabase:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to project
   supabase link --project-ref your-project-ref

   # Deploy functions
   supabase functions deploy process-document
   supabase functions deploy classify-topic
   supabase functions deploy process-url
   supabase functions deploy query-rag
   ```

5. **Configure Secrets**
   ```bash
   # Set OpenAI API key
   supabase secrets set OPENAI_API_KEY=your_key

   # Set Lovable AI key
   supabase secrets set LOVABLE_API_KEY=your_key
   ```

6. **Configure Authentication**
   ```
   Authentication → Providers
   → Email: Enable
   → Auto-confirm users: Enable (development) / Disable (production)
   → Email templates: Customize
   ```

7. **Configure CORS**
   ```
   Settings → API
   → Additional allowed origins: https://yourdomain.com
   ```

---

## Environment Variables

### Frontend Variables

Required at build time:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_SUPABASE_PROJECT_ID=your_project_id
```

### Backend Variables (Edge Functions)

Required in Supabase secrets:

```env
# Automatically provided by Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_DB_URL=postgresql://...

# Must be set manually
OPENAI_API_KEY=sk-...
LOVABLE_API_KEY=your_lovable_key
```

**Setting secrets**:
```bash
# Via CLI
supabase secrets set OPENAI_API_KEY=sk-...

# Via Dashboard
Settings → Edge Functions → Manage secrets
```

---

## Pre-Deployment Checklist

### Security
- [ ] RLS enabled on all tables
- [ ] RLS policies tested for all roles
- [ ] Service role key not exposed to frontend
- [ ] CORS configured for production domain
- [ ] Authentication email templates customized
- [ ] Rate limiting configured (if needed)
- [ ] Secrets stored securely (not in code)

### Performance
- [ ] Database indexes created
- [ ] HNSW index on embeddings
- [ ] Static assets optimized
- [ ] Images compressed
- [ ] Bundle size checked (<500KB gzipped)
- [ ] Lazy loading implemented
- [ ] CDN configured for static assets

### Functionality
- [ ] File upload works (all formats)
- [ ] OCR processing works
- [ ] Document classification works
- [ ] Vector search returns results
- [ ] Chat responses accurate
- [ ] Drag & drop folder organization works
- [ ] Real-time updates work
- [ ] Authentication flow complete
- [ ] Error handling graceful

### Monitoring
- [ ] Error tracking configured (Sentry, LogRocket)
- [ ] Analytics configured (PostHog, Plausible)
- [ ] Logging configured (edge functions)
- [ ] Performance monitoring (Web Vitals)
- [ ] Uptime monitoring (UptimeRobot, Pingdom)

---

## Post-Deployment

### 1. Verify Deployment

**Frontend**:
```bash
# Check app loads
curl -I https://yourdomain.com

# Verify build version
# Check console for version logs
```

**Backend**:
```bash
# Test edge function
curl -X POST https://your-project.supabase.co/functions/v1/query-rag \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"test","conversationId":"uuid","userId":"uuid"}'
```

**Database**:
```sql
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public';
```

### 2. Monitor Performance

**Key Metrics**:
- Page load time (target: <3s)
- Time to Interactive (target: <5s)
- First Contentful Paint (target: <1.5s)
- Edge function response time (target: <2s)
- Database query time (target: <100ms)

**Tools**:
- Google PageSpeed Insights
- WebPageTest
- Lighthouse CI
- Supabase Dashboard (Edge Functions & Database tabs)

### 3. Set Up Monitoring

**Sentry (Error Tracking)**:
```typescript
// src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your_sentry_dsn",
  environment: "production",
  tracesSampleRate: 0.1,
});
```

**PostHog (Analytics)**:
```typescript
// src/main.tsx
import posthog from 'posthog-js';

posthog.init('your_posthog_key', {
  api_host: 'https://app.posthog.com'
});
```

### 4. Configure Backups

**Database Backups**:
- Supabase Pro: Daily automated backups
- Manual: Export via pg_dump
- Retention: 7-30 days recommended

**Document Backups**:
```sql
-- Export documents metadata
COPY (SELECT * FROM documents) TO '/path/documents.csv' CSV HEADER;

-- Export chunks (large file)
COPY (SELECT * FROM document_chunks) TO '/path/chunks.csv' CSV HEADER;
```

### 5. Document Runbook

Create an operations runbook:

**Common Issues**:
```markdown
## Document Processing Fails
1. Check OpenAI API key validity
2. Check edge function logs
3. Verify file size < 20MB
4. Check error_message in documents table

## Slow Query Performance
1. Check HNSW index exists
2. Run VACUUM ANALYZE
3. Check database CPU usage
4. Consider increasing database tier

## Authentication Issues
1. Verify email template
2. Check SMTP settings
3. Check RLS policies
4. Verify JWT token validity
```

---

## Scaling

### Database Scaling

**Vertical Scaling**:
```
Supabase Dashboard → Settings → Database
→ Increase instance size
```

**Connection Pooling**:
```typescript
// Already configured in Supabase
// Default: 60 connections (free tier)
// Upgrade for more connections
```

**Read Replicas** (Pro plan):
```
Settings → Database → Add read replica
→ Route read queries to replica
```

### Edge Function Scaling

**Automatic Scaling**:
- Edge functions scale automatically
- No configuration needed
- Pay per invocation

**Optimization**:
```typescript
// Reduce cold starts
// Keep functions warm with scheduled invocations
```

### Frontend Scaling

**CDN Configuration**:
```
Cloudflare / CloudFront
→ Cache static assets
→ Set cache headers
→ Enable compression
```

**Load Balancing** (if needed):
```nginx
upstream frontend {
    server server1.example.com;
    server server2.example.com;
    server server3.example.com;
}

server {
    listen 80;
    location / {
        proxy_pass http://frontend;
    }
}
```

---

## Costs

### Lovable Platform
- **Free Tier**: 
  - 5 credits/day
  - lovable.app subdomain
  - Basic features
  
- **Pro Tier** (~$20/month):
  - 100+ credits/month
  - Custom domains
  - Advanced features

### Supabase
- **Free Tier**:
  - 500MB database
  - 1GB file storage
  - 2GB bandwidth/month
  - 50,000 monthly active users
  
- **Pro Tier** ($25/month):
  - 8GB database
  - 100GB file storage
  - 250GB bandwidth/month
  - 100,000 monthly active users
  - Daily backups
  - Point-in-time recovery

### External APIs
- **OpenAI Embeddings**:
  - text-embedding-3-small: $0.02 / 1M tokens
  - Estimate: ~$5-10/month for 1000 documents
  
- **Lovable AI Gateway**:
  - Usage-based pricing
  - Included with Lovable plan

### Total Estimated Costs

**Small Team (100 users, 1000 documents)**:
- Lovable Pro: $20/month
- Supabase Free: $0/month
- OpenAI: ~$10/month
- **Total: ~$30/month**

**Medium Business (1000 users, 10,000 documents)**:
- Lovable Pro: $20/month
- Supabase Pro: $25/month
- OpenAI: ~$100/month
- **Total: ~$145/month**

**Large Enterprise (10,000+ users)**:
- Contact for custom pricing
- Dedicated infrastructure recommended

---

## Rollback Procedure

### Quick Rollback (Lovable Platform)

1. Open Lovable editor
2. Click version history icon
3. Select previous working version
4. Click "Restore"
5. Re-publish

### Manual Rollback

**Frontend**:
```bash
# Revert to previous git commit
git revert HEAD
git push

# Redeploy
vercel --prod
```

**Backend**:
```bash
# Restore database from backup
supabase db reset --linked

# Redeploy previous edge function version
git checkout <previous-commit>
supabase functions deploy <function-name>
```

---

## Maintenance Schedule

**Daily**:
- Check error logs
- Monitor performance metrics
- Review API costs

**Weekly**:
- Review user feedback
- Check database size
- Optimize slow queries
- Update dependencies (security)

**Monthly**:
- Full backup verification
- Security audit
- Cost optimization review
- Performance optimization

**Quarterly**:
- Dependency updates (major versions)
- Architecture review
- Scalability assessment
- Disaster recovery test

---

## Support

For deployment issues:
- [Lovable Documentation](https://docs.lovable.dev)
- [Supabase Documentation](https://supabase.com/docs)
- [GitHub Issues](your-repo/issues)
- [Discord Community](your-discord)

---

**Last Updated**: 2024-01-20
