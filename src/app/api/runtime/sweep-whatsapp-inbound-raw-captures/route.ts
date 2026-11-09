import { NextResponse, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { runWhatsappInboundRawCaptureSweep } from '@/lib/channels/whatsapp/raw-capture-sweep';

// Doopla Intelligence Core v1 — Runtime, Fase 2 (ADR 0002, seção 12):
// disparo periódico do sweep de recuperação de capturas de WhatsApp
// (Fase 1, migration 0112) que nunca concluíram o processamento.
// Nenhuma lógica de retomada aqui — só o disparo + autenticação, mesmo
// padrão de reconcile-pending-replies/drain-professional-self-messages.
// Chamada por vercel.json (crons), nunca exposta pro painel/browser.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const tally = await runWhatsappInboundRawCaptureSweep(supabase, { limit: 50 });

  return NextResponse.json({ tally });
}
