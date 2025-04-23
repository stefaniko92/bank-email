'use server';

import {NextResponse} from 'next/server';

/**
 * @fileOverview Receives email data from Mailgun via POST request.
 *
 * This route handles POST requests to receive email data from Mailgun.
 * It logs the received data and returns a JSON response indicating success or failure.
 */

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const data: {[key: string]: any} = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    console.log('Received email data from Mailgun:', data);

    return NextResponse.json({received: true, data}, {status: 200});
  } catch (error) {
    console.error('Error processing email from Mailgun:', error);
    return NextResponse.json(
      {received: false, error: (error as any).message},
      {status: 500}
    );
  }
}
