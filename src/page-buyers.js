Pages.buyers={title:'For buyers · Dealpin',desc:'Open a seller’s link, agree to the deal, confirm delivery and keep a receipt. No account needed.',
html:()=>head('For buyers','Open the link, agree, and keep proof of what you paid for and received.')+`<section class="sec"><div class="wrap narrow"><h2>What you do</h2><ol class="tl">${[
['Open the link','Tap the link the seller sent. It opens in any phone or computer browser, with no app to install and no account to create.'],
['Read and agree','Check the item, price, currency and terms, then agree. You can read Dealpin in English, Luganda or Kiswahili.'],
['Share the delivery spot (optional)','Tap the button to share a location pin, a landmark and a short voice note. Location and microphone are used only when you tap.'],
['Confirm receipt','When the item arrives, tap “I received it”. The deal becomes verified and you get a receipt with a code.'],
['Report a problem','If something is wrong, report it with a description and a photo. The seller replies, and the record keeps the order of events.']].map((s,i)=>`<li><span class="dot">${i+1}</span><h3>${s[0]}</h3><p>${s[1]}</p></li>`).join('')}</ol></div></section>
<section class="sec tint"><div class="wrap narrow"><h2>Check a receipt</h2><p class="lead2">Anyone can verify a receipt with its code, at <a href="app/#/verify">Verify a receipt</a>. Pay the seller directly by the method you agree, and keep the receipt Dealpin gives you.</p></div></section>${cta('Open a deal link you were sent')}`};
