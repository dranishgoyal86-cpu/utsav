import { supabase } from '../supabase';
import { callEdgeFunction } from '../helpers';
import { PUBLIC_WEB_URL } from '../config';

// Sends the "you're approved -- import your existing catalog" email, once
// per provider no matter which of the two real admin-approval flows
// (ClaimRequests.js's claim approval, AdminPanel.js's verification
// approval) triggers it first -- a provider can legitimately go through
// both, and the user explicitly asked for both to trigger this without a
// duplicate send.
//
// The guard is providers.bulk_import_invited_at (see
// supabase/migrations/bulk_import_invite_email.sql), claimed via a single
// atomic conditional UPDATE -- not a separate SELECT-then-write, which
// would leave a real race window between the two approval paths. Whichever
// caller's UPDATE actually returns a row "won" the claim and is the one
// that proceeds to send.
export async function sendBulkImportInviteEmail(providerId) {
  try {
    const { data: won, error: claimErr } = await supabase
      .from('providers')
      .update({ bulk_import_invited_at: new Date().toISOString() })
      .eq('id', providerId)
      .is('bulk_import_invited_at', null)
      .select('id, name, user_id')
      .maybeSingle();

    if (claimErr) { console.log('bulk-import invite claim error:', claimErr.message); return; }
    if (!won) return; // already sent (or being sent) via the other approval path -- no-op

    const { data: userRow } = await supabase
      .from('users').select('email').eq('id', won.user_id).maybeSingle();
    if (!userRow?.email) return;

    // BulkImportServices only exists inside the logged-in provider stack
    // (App.js) -- no provider screen has ever had a deep-link path before
    // this (linking.js's registered screens are all pre-login/guest flows),
    // so the plain-text fallback line matters just as much as the link for
    // a recipient who isn't already logged in when they open the email.
    const link = `${PUBLIC_WEB_URL}/import-services`;
    await callEdgeFunction('send-email', {
      to: userRow.email,
      subject: "You're approved! Import your existing catalog into Utsav",
      html: `
        <p>Hi${won.name ? ` ${won.name}` : ''},</p>
        <p>Your provider profile on Utsav is now approved. If you already list your services elsewhere, you can bring your whole catalog in at once instead of adding each one by hand:</p>
        <p><a href="${link}">${link}</a></p>
        <p>If that link doesn't open the app directly, open Utsav and go to Services &rarr; Import from spreadsheet.</p>
      `,
    });
  } catch (err) {
    // Never let an email failure block the admin action that triggered it
    // -- the provider is already approved/verified on the DB side either way.
    console.log('sendBulkImportInviteEmail non-fatal error:', err.message);
  }
}
