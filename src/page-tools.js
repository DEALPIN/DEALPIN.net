Pages.tools={title:'Seller tools · Dealpin',desc:'Business Autopilot, deliveries and riders, rider settlements, ledger, invoices, stock and purchasing. Free for every seller.',
html:()=>head('Seller tools','Everything a chat business runs on, in one app, free for every seller.')+`<section class="sec"><div class="wrap rows">${[
['users','Business Autopilot','Customers, opportunities, tasks, suppliers, expenses, staff and branches, with a Daily Command that ranks what needs attention first.'],
['truck','Deliveries and riders','Pickups and drop-offs with fees, cash on delivery, a proof photo, a map pin and a server-checked handover code.'],
['coins','Rider settlements','Flat or percentage pay, totalled for each rider so end-of-day sums are exact.'],
['book','Ledger','Who owes you and who you owe, with part payments, due dates and a WhatsApp reminder.'],
['doc','Invoices','Line items, tax, discounts and payments. Make an invoice straight from a deal.'],
['box','Stock and purchasing','A stock ledger that records every movement, purchase orders that update stock when received, and reservations that turn into sales.'],
['users','Group orders','Collect several buyers into one order and keep it tidy.']].map((t,i)=>`<article class="row${i%2?' alt':''}"><div class="rv">${ic(t[0],'huge')}</div><div><h3>${t[1]}</h3><p>${t[2]}</p></div></article>`).join('')}</div></section>${cta()}`};
