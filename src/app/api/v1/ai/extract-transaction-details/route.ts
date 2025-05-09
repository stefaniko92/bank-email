import { NextResponse } from 'next/server';
import { extractTransactionDetails } from '@/ai/flows/extract-transaction-details';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'PDF file is required' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }

    try {
      // Convert the File to Buffer for Gemini AI
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Extract transactions using Gemini AI
      const transactions = await extractTransactionDetails(buffer);
      return NextResponse.json({ transactions });
    } catch (error: any) {
      console.error('Error processing PDF:', error);
      return NextResponse.json(
        { error: `Error processing PDF: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in extract-transaction-details API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract transaction details' },
      { status: 500 }
    );
  }
} 