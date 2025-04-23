'use server';

import {NextResponse} from 'next/server';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const data: {[key: string]: any} = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    console.log('Received email data:', data);

    return NextResponse.json({received: true, data});
  } catch (error) {
    console.error('Error processing email:', error);
    return NextResponse.json({received: false, error: error}, {status: 500});
  }
}
