-- Lets a customer's payment-receipt screen pull the PROVIDER's business/GST
-- details for a booking they actually made, without opening provider_billing
-- up to every customer for every provider (its existing RLS is owner + admin
-- only, and stays that way — bank_account/bank_ifsc in particular shouldn't
-- be blanket-readable). SECURITY DEFINER + an explicit auth check inside,
-- same shape as reserve_invoice_number().
create or replace function public.get_booking_invoice_billing(p_booking_id uuid)
returns table (
  business_name text, address text, city text, state text, pincode text,
  gstin text, pan text, phone text, email text, sac_code text,
  bank_name text, bank_account text, bank_ifsc text, logo_url text
)
language plpgsql
security definer
as $function$
declare
  v_customer_id uuid;
  v_provider_user_id uuid;
begin
  select b.customer_id, p.user_id
    into v_customer_id, v_provider_user_id
  from bookings b
  join providers p on p.id = b.provider_id
  where b.id = p_booking_id;

  if v_customer_id is null then
    raise exception 'Booking not found';
  end if;

  -- auth.uid() is NULL for an unauthenticated/anon caller, and NULL != x
  -- evaluates to NULL rather than TRUE — an `if` on that condition silently
  -- does not raise, which would let an anonymous caller through. Guard for
  -- NULL explicitly rather than relying on the inequality alone.
  if auth.uid() is null or (auth.uid() != v_customer_id and auth.uid() != v_provider_user_id) then
    raise exception 'Not authorized for this booking';
  end if;

  return query
    select pb.business_name, pb.address, pb.city, pb.state, pb.pincode,
           pb.gstin, pb.pan, pb.phone, pb.email, pb.sac_code,
           pb.bank_name, pb.bank_account, pb.bank_ifsc, pb.logo_url
    from provider_billing pb
    where pb.provider_user_id = v_provider_user_id;
end;
$function$;

-- Explicit belt-and-suspenders on top of the auth.uid() IS NULL guard above
-- (new functions default to PUBLIC/anon EXECUTE, same as this project's
-- existing reserve_invoice_number) — a real customer/provider always has an
-- authenticated session by the time this screen loads, anon has no reason to.
revoke execute on function public.get_booking_invoice_billing(uuid) from anon;
