import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const STUDY_ID = 'cml808mzc0000m104un333c69';

// One-time endpoint to update study text
// DELETE this file after running once!
export async function POST(request: Request) {
  try {
    // Simple auth check - require a secret header
    const authHeader = request.headers.get('x-admin-secret');
    if (authHeader !== 'izvrs-update-2025') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const study = await prisma.study.update({
      where: { id: STUDY_ID },
      data: {
        title: 'IzVRS Likovni natečaj 2025',
        description: 'Slepo primerjanje likovnih del učencev za izbor najboljših 12, ki bodo natisnjeni na sledilnikih. Pomagajte nam pri izboru!',
      },
    });

    return NextResponse.json({
      success: true,
      study: {
        id: study.id,
        title: study.title,
        description: study.description,
      },
    });
  } catch (error) {
    console.error('Error updating study:', error);
    return NextResponse.json({ error: 'Failed to update study' }, { status: 500 });
  }
}
