# Quick Start Guide

## 5-Minute Setup

### 1. Install & Run
```bash
git clone <repo-url>
cd cerebro-rag-app
npm install
npm run dev
```

### 2. Create Account
- Navigate to `http://localhost:5173`
- Click "Sign Up"
- Enter email and password
- Auto-confirmed (development mode)

### 3. Add OpenAI Key
- Go to Settings → Secrets
- Add `OPENAI_API_KEY` with your OpenAI API key
- Get key from: https://platform.openai.com/api-keys

### 4. Upload Documents
- Click "Upload" button
- Select PDFs, DOCX, or images
- Wait for processing (progress shown)

### 5. Ask Questions
- Type question in chat: "What are the main topics?"
- Get AI-powered answers with sources

## Common Commands

```bash
# Development
npm run dev          # Start dev server

# Build
npm run build        # Create production build
npm run preview      # Preview production build

# Database
supabase status      # Check Supabase status
supabase functions deploy  # Deploy edge functions
```

## File Structure

```
src/
├── components/       # React components
├── pages/           # Page components
├── integrations/    # Supabase integration
├── hooks/           # Custom React hooks
└── lib/             # Utilities

supabase/
├── functions/       # Edge functions
└── migrations/      # Database migrations

docs/
├── ARCHITECTURE.md  # System architecture
├── API.md          # API documentation
├── DATABASE.md     # Database schema
└── DEPLOYMENT.md   # Deployment guide
```

## Troubleshooting

**Processing fails**: Check OpenAI API key in secrets
**No results in chat**: Ensure documents show "ready" status
**Can't log in**: Clear browser cache and try again

## Next Steps

- Read [ARCHITECTURE.md](./ARCHITECTURE.md) for system design
- Check [API.md](./API.md) for API details
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup

---
**Ready to build!** 🚀
