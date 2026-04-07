#!/bin/bash
# Build script for Vercel deployment

echo "🔨 Building React frontend..."
cd frontend
npm install --legacy-peer-deps
npm run build
cd ..

echo "✅ Frontend build complete!"
