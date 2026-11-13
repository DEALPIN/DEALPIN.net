Pages.glossary={title:'Glossary · Dealpin',desc:'What the words in Dealpin mean: deal link, handover code, receipt code, verified, dispute and more.',
html:()=>head('Glossary','The words used in Dealpin, in plain language.')+`<section class="sec"><div class="wrap narrow"><dl class="gl">${[
['Deal link','The private link a seller sends to a buyer. Opening it needs no account.'],
['Rider link','A separate private link for the person delivering the item. It is not the buyer’s link.'],
['Handover code','The code the buyer gives the rider at delivery. The rider enters it to confirm the handover.'],
['Receipt code','The code on a verified receipt. Anyone with the code can check the receipt at Verify a receipt.'],
['Verified','A deal the buyer has confirmed as received. A verified deal creates a receipt.'],
['Dispute','A problem the buyer reports with a description and a photo. The seller replies and the record keeps the steps.'],
['Status','Where a deal is now: created, agreed, shipped, received, disputed, cancelled or resolved.'],
['Public record','A seller’s verified deals and ratings, shown to buyers who open the seller’s page.']].map(g=>`<div><dt>${g[0]}</dt><dd>${g[1]}</dd></div>`).join('')}</dl></div></section>${cta()}`};
