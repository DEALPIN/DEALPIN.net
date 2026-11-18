Pages.sellers={title:'For sellers · Dealpin',desc:'Create a deal link in minutes, send it on WhatsApp, Instagram or TikTok, and keep a receipt for every sale.',
html:()=>head('For sellers','Sell from your phone, keep the record, and answer “did you get it?” with proof.')+`<section class="sec"><div class="wrap narrow"><h2>Start a sale</h2><ol class="tl">${[
['Create the deal','Name the item, set the price and currency, choose delivery or pickup, add terms and up to three photos.'],
['Send the link','Share it in your chat. The buyer opens it in a browser and does not need an account.'],
['Follow it','Watch the status move from created to agreed, shipped and received. Remind the buyer from the deal when needed.'],
['Keep the receipt','When the buyer confirms receipt, the deal is verified and a receipt with a code is created. Print it, save it as PDF or send it on WhatsApp.']].map((s,i)=>`<li><span class="dot">${i+1}</span><h3>${s[0]}</h3><p>${s[1]}</p></li>`).join('')}</ol></div></section>
<section class="sec tint"><div class="wrap narrow"><h2>Beyond one deal</h2><div class="bento">
<a class="bt" href="#/tools"><h3>Seller tools</h3><p>Deliveries, ledger, invoices, stock and group orders.</p></a>
<a class="bt" href="#/explore"><h3>Explore and products</h3><p>Publish products that anyone can browse, and turn buyer interest into a deal.</p></a>
<a class="bt" href="#/trust"><h3>Your public record</h3><p>Verified deals and ratings build a seller record that buyers can check.</p></a>
<a class="bt" href="#/faq"><h3>Questions</h3><p>Money, disputes, currencies and languages, answered plainly.</p></a></div>
<p class="fine">Payment happens between you and the buyer, outside Dealpin. Dealpin records what both sides report.</p></div></section>${cta('Create your first deal link')}`};
