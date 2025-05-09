import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Handle API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    console.log('API route middleware:', request.nextUrl.pathname);
    return NextResponse.next();
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
  ],
} 