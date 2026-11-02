-- পুরো টাকা বাকি (amount_received = 0) হলে sale_receives-এ ০ টাকার রো রাখা যাবে
alter table public.sale_receives drop constraint if exists sale_receives_amount_check;
alter table public.sale_receives add constraint sale_receives_amount_check check (amount >= 0);
