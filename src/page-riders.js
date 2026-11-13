Pages.riders={title:'For riders · Dealpin',desc:'Get a delivery link with the pin and landmark, confirm arrival and complete the handover with a code.',
html:()=>head('For riders','A delivery link, a clear pin and a timed handover. No account needed.')+`<section class="sec"><div class="wrap narrow"><h2>A delivery, step by step</h2><ol class="tl">${[
['Open the delivery link','The seller gives you a private link for this delivery. It shows the pin, the landmark and a number to call. Only what the delivery needs is shown here.'],
['Tap arrived','Your arrival is time-stamped in the record.'],
['Complete the handover','Ask the buyer for the handover code, enter it, and confirm. Wrong codes are counted and limited, so a guess will not work.']].map((s,i)=>`<li><span class="dot">${i+1}</span><h3>${s[0]}</h3><p>${s[1]}</p></li>`).join('')}</ol></div></section>
<section class="sec tint"><div class="wrap narrow"><h2>Why this protects you</h2><p class="lead2">Your steps are time-stamped, so the timing of a delivery is recorded for everyone. If a buyer disputes a delivery, the record shows what happened and when.</p></div></section>${cta('Have a delivery link? Open it now')}`};
