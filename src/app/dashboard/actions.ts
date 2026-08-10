'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import type { Invite } from '@/lib/supabase/types';

export async function confirmInviteAction(formData: FormData) {
  const inviteId = String(formData.get('inviteId') ?? '');
  if (!inviteId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: invite } = await supabase
    .from('invites')
    .select('*')
    .eq('id', inviteId)
    .single<Invite>();

  if (
    !invite ||
    invite.invitee_profile_id !== user.id ||
    invite.status !== 'pendente'
  ) {
    return;
  }

  const { error: repError } = await supabase.from('representations').insert({
    artist_profile_id: user.id,
    booker_profile_id: invite.inviter_profile_id,
    created_via_invite_id: invite.id,
  });

  // Se a representação já existir (convite duplicado), segue e confirma
  // o convite do mesmo jeito — o que importa é o estado final.
  if (repError && repError.code !== '23505') {
    return;
  }

  await supabase
    .from('invites')
    .update({ status: 'confirmado', confirmed_at: new Date().toISOString() })
    .eq('id', inviteId);

  revalidatePath('/dashboard');
}
