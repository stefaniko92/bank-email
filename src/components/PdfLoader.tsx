'use client';

import { useEffect, useState } from 'react';
import { initPdfJs } from '@/lib/pdf-utils';

interface PdfLoaderProps {
  children: React.ReactNode;
}

/**
 * This component ensures PDF.js is properly loaded before rendering children
 */
export default function PdfLoader({ children }: PdfLoaderProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Initialize PDF.js in client side only
    try {
      initPdfJs();
      setIsLoaded(true);
    } catch (error) {
      console.error('Failed to initialize PDF.js:', error);
    }
  }, []);

  if (!isLoaded) {
    return <div>Loading PDF processor...</div>;
  }

  return <>{children}</>;
} 