import { handleWebhookEvent } from '@/payment';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Creem webhook handler
 * Accepts JSON body without signature (per template). Add signature verification if needed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const json = await req.json();
    const payload = JSON.stringify(json || {});

    await handleWebhookEvent(payload, '');
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Error in Creem webhook route:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}
