Pages.tools={title:'Seller tools · Dealpin',desc:'Deliveries and riders, rider settlements, ledger, invoices, stock and group orders for small sellers.',
html:()=>head('Seller tools','The back office of a chat business, in the same app. Tools record what people report; they never hold money.')+`<section class="sec"><div class="wrap rows">${[
['truck','Deliveries and riders','Pickups and drop-offs with fees, cash on delivery, a proof photo and a map pin. A server-checked handover code and a full event trail.'],
['coins','Rider settlements','Flat or percentage pay, totalled for each rider so end-of-day sums are not guesswork.'],
['book','Ledger','Who owes you and who you owe, with part payments and due dates, plus a WhatsApp reminder.'],
['doc','Invoices','Line items, tax, discounts and payments. Make one straight from a deal.'],
['box','Stock','Quantities per product with a guard that stops them going below zero.'],
['users','Group orders','Collect several buyers into one order and keep it tidy.']].map((t,i)=>`<article class="row${i%2?' alt':''}"><div class="rv">${ic(t[0],'huge')}</div><div><h3>${t[1]}</h3><p>${t[2]}</p></div></article>`).join('')}</div></section>${cta()}`};
