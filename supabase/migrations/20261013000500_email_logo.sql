-- Booking emails open with the Waiting for Paws logo next to the name (it falls back to just the
-- name when an email app blocks images).

create or replace function private.email_layout(
  p_heading text,
  p_intro text,
  p_body text,
  p_cta_label text default null,
  p_cta_url text default null,
  p_note text default null
)
returns text
language sql
immutable
set search_path = ''
as $$
  select
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    || '<body style="margin:0;padding:0;background:#FFF7EA;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,Helvetica,Arial,sans-serif;color:#0F2B3F">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7EA;padding:24px 12px"><tr><td align="center">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">'
    || '<tr><td style="padding:4px 8px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    || '<td style="vertical-align:middle"><img src="https://waitingforpaws.com/brand/logo-email.png" width="44" height="44" alt=""'
    || ' style="display:block;width:44px;height:44px;border:0;border-radius:50%"></td>'
    || '<td style="vertical-align:middle;padding-left:10px;font-size:18px;font-weight:800;color:#1A6FA0">Waiting for Paws</td>'
    || '</tr></table></td></tr>'
    || '<tr><td style="background:#FFFFFF;border-radius:24px;padding:28px 24px;border:1px solid #E6EEF3">'
    || '<h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;color:#0F2B3F">' || private.html(p_heading) || '</h1>'
    || '<p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#3D5566">' || private.html(p_intro) || '</p>'
    || coalesce(p_body, '')
    || case when coalesce(p_note, '') <> '' then
         '<p style="margin:16px 0 0;padding:12px 14px;background:#FFF3D1;border-radius:14px;font-size:14px;line-height:1.5;color:#0F2B3F;white-space:pre-line">'
         || private.html(p_note) || '</p>'
       else '' end
    || case when p_cta_url is not null then
         '<p style="margin:24px 0 4px"><a href="' || private.html(p_cta_url)
         || '" style="display:inline-block;background:#FFC845;color:#0F2B3F;font-weight:800;font-size:16px;text-decoration:none;padding:12px 22px;border-radius:999px">'
         || private.html(p_cta_label) || '</a></p>'
       else '' end
    || '</td></tr>'
    || '<tr><td style="padding:16px 8px;font-size:12px;line-height:1.5;color:#6B7F8E;text-align:center">'
    || 'Waiting for Paws &middot; Dog walking in Ocean Beach, San Diego<br>Questions? Just reply to this email.</td></tr>'
    || '</table></td></tr></table></body></html>';
$$;
