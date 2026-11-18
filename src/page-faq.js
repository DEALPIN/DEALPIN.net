Pages.faq={title:'FAQ · Dealpin',desc:'Answers about buyers, money, disputes, currencies, languages, offline use and data.',
html:()=>head('Questions','Short answers, plainly.')+`<section class="sec"><div class="wrap narrow">${[
['Does my buyer need to install anything?','No. They open your link in any phone or computer browser and do not create an account.'],
['Does Dealpin hold the money?','No. Payment happens between you and the buyer, outside Dealpin. Dealpin records what both sides report.'],
['What happens if there is a dispute?','The buyer reports a problem with a description and a photo. You reply and mark it resolved. Dealpin keeps the full order of events, so both sides can see exactly what happened.'],
['Can I use it in my country and currency?','Yes. Pick your country and currency in Settings. Each deal keeps its own currency.'],
['Which languages are supported?','Buyer screens: English, Luganda and Kiswahili. Seller screens are partly translated while native speakers review the wording.'],
['Can I use it offline?','You can install Dealpin and open it without a connection. A buyer’s answer saved offline is sent when the connection returns.'],
['Who can see my data?','The seller, the buyer and the rider each see only the parts of a deal they need. See the <a href="app/privacy.html">privacy policy</a>.'],
['How do I check a receipt I was sent?','Open <a href="app/#/verify">Verify a receipt</a> and enter the code.']].map(q=>`<details><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join('')}</div></section>${cta('Still have a question?')}`};
