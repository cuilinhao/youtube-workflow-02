import { NextResponse } from 'next/server';
import { applyUpdate, readAppData, writeAppData } from '@/lib/data-store';
import type { UpdatePayload } from '@/lib/types';

export async function GET() {
  const data = await readAppData();
  return NextResponse.json(data, { status: 200 });
}

export async function PUT(request: Request) {
  const body = await request.json();
  await writeAppData(body);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const updates = Array.isArray(body?.updates)
    ? (body.updates as UpdatePayload<unknown>[])
    : [];

  if (!updates.length) {
    return NextResponse.json({ success: false, message: 'No updates provided.' }, { status: 400 });
  }

  let updated = await readAppData();
  updates.forEach((update) => {
    updated = applyUpdate(updated, update);
  });
  await writeAppData(updated);

  return NextResponse.json(updated, { status: 200 });
}
